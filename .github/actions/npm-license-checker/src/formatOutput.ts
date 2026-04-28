import type {
  CustomFields,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos
} from './types.ts'

export default function formatOutput(
  licenseChecker: LicenseChecker,
  merged: ModuleInfos,
  format: DetailsOutputFormat,
  customFields?: CustomFields
): string {
  switch (format) {
    case 'csv':
      return licenseChecker.asCSV(merged, customFields)
    case 'markdown':
      return licenseChecker.asMarkDown(merged, customFields)
    case 'plainVertical':
      return licenseChecker.asPlainVertical(merged)
    case 'json':
    default:
      return JSON.stringify(merged, null, 2)
  }
}
