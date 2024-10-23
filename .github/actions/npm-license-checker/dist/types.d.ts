import type core from '@actions/core';
import type licenseChecker from 'license-checker';
export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>;
export type LicenseChecker = Pick<typeof licenseChecker, 'init'>;
export declare enum DependencyType {
    Production = "production",
    Development = "development",
    All = "all"
}
export type CheckLicensesOptions = {
    dependencyType: DependencyType;
    startPath: string;
    customFields?: Record<string, any>;
    onlyAllow?: string;
    detailsOutputPath?: string;
    excludePackages?: string;
};
export interface RunOptions {
    core: Core;
    licenseChecker: LicenseChecker;
}
