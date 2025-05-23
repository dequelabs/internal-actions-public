import { CheckLicensesOptions, Core, LicenseChecker, ModuleInfos } from './types';
export default function checkLicenses(licenseChecker: LicenseChecker, options: CheckLicensesOptions, core: Core): Promise<ModuleInfos>;
