"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const LABEL_THRESHOLDS = {
    Blocker: 4,
    Critical: 10,
    Serious: 20,
    Moderate: 30
};
const SLA_LABELS = ['SLA P1', 'SLA P2', 'SLA P3', 'SLA Breach'];
const REQUIRED_LABELS = ['A11y', 'VPAT'];
function isSLALabel(name) {
    return SLA_LABELS.includes(name);
}
function getSLALabel(weeksOld, impactLevel) {
    const impactSLAWeeks = LABEL_THRESHOLDS[impactLevel];
    if (weeksOld >= impactSLAWeeks) {
        return 'SLA Breach';
    }
    else if (weeksOld >= impactSLAWeeks - 1) {
        return 'SLA P1';
    }
    else if (weeksOld >= impactSLAWeeks - 2) {
        return 'SLA P2';
    }
    else if (weeksOld >= impactSLAWeeks - 3) {
        return 'SLA P3';
    }
}
async function run() {
    try {
        const token = core.getInput('github-token', { required: true });
        const octokit = github.getOctokit(token);
        const { owner, repo } = github.context.repo;
        core.info('🚀 Fetching open issues from GitHub API...');
        const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
            owner,
            repo,
            state: 'open',
            labels: REQUIRED_LABELS.join(',')
        }, response => response.data.map(issue => ({
            number: issue.number,
            createdAt: issue.created_at,
            labels: issue.labels.map(label => ({
                name: typeof label === 'string' ? label : label?.name || ''
            }))
        })));
        core.info(`Total Issues Fetched: ${issues.length}`);
        if (issues.length === 0) {
            core.info('⚠️ No issues found with the required labels.');
            return;
        }
        const currentTimestamp = Math.floor(new Date().getTime() / 1000);
        for (const issue of issues) {
            const createdAtTimestamp = Math.floor(new Date(issue.createdAt).getTime() / 1000);
            const daysOld = Math.floor((currentTimestamp - createdAtTimestamp) / 86400);
            const weeksOld = Math.floor(daysOld / 7);
            let impactLevel = undefined;
            for (const levelKey in LABEL_THRESHOLDS) {
                const currentImpactLevel = levelKey;
                if (issue.labels.some(label => label.name.toLowerCase() === currentImpactLevel.toLowerCase())) {
                    impactLevel = currentImpactLevel;
                    break;
                }
            }
            if (!impactLevel) {
                core.info(`⚠️ Issue #${issue.number} has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping.`);
                continue;
            }
            const newSLALabel = getSLALabel(weeksOld, impactLevel);
            const allCurrentLabelNamesOnIssue = issue.labels.map(l => l.name);
            const labelsToRemove = issue.labels
                .filter(label => isSLALabel(label.name) && label.name !== newSLALabel)
                .map(label => label.name);
            for (const labelNameToRemove of labelsToRemove) {
                core.info(`🚫 Removing label: ${labelNameToRemove} from Issue #${issue.number}`);
                try {
                    await octokit.rest.issues.removeLabel({
                        owner,
                        repo,
                        issue_number: issue.number,
                        name: labelNameToRemove
                    });
                }
                catch (e) {
                    const error = e;
                    throw new Error(`Could not remove label ${labelNameToRemove} from issue #${issue.number}: ${error.message}`);
                }
            }
            const shouldAddNewLabel = !!newSLALabel && !allCurrentLabelNamesOnIssue.includes(newSLALabel);
            if (shouldAddNewLabel) {
                core.info(`➕ Adding new label: ${newSLALabel} to Issue #${issue.number}`);
                try {
                    await octokit.rest.issues.addLabels({
                        owner,
                        repo,
                        issue_number: issue.number,
                        labels: [newSLALabel]
                    });
                }
                catch (e) {
                    const error = e;
                    throw new Error(`Could not add label ${newSLALabel} to issue #${issue.number}: ${error.message}`);
                }
            }
        }
    }
    catch (e) {
        const error = e;
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed(`An unknown error occurred: ${String(error)}`);
        }
    }
}
run();
//# sourceMappingURL=main.js.map