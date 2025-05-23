import type core from '@actions/core';
import type licenseChecker from 'license-checker-rseidelsohn';
export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>;
export type ModuleInfos = licenseChecker.ModuleInfos;
export type LicenseChecker = Pick<typeof licenseChecker, 'init'> & {
    asSummary: (moduleInfos: licenseChecker.ModuleInfos) => string;
};
export declare enum DependencyType {
    Production = "production",
    Development = "development",
    All = "all"
}
export declare enum DetailsOutputFormat {
    JSON = "json",
    CSV = "csv",
    Markdown = "markdown",
    PlainVertical = "plainVertical"
}
export type CustomFields = Record<string, any>;
export type CheckLicensesOptions = {
    dependencyType: DependencyType;
    startPath: string;
    customFields?: CustomFields;
    clarificationsPath?: string;
    onlyAllow?: string;
    detailsOutputPath?: string;
    excludePackages?: string;
    excludePackagesStartingWith?: string;
    detailsOutputFormat: DetailsOutputFormat;
};
export interface RunOptions {
    core: Core;
    licenseChecker: LicenseChecker;
}
