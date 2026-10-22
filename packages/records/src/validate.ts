// Checks untrusted data (a spider's output, a file read back) against the schema. Each function returns the
// value typed, or throws a RecordValidationError naming every problem and where it is.
import * as v from 'valibot'
import { RecordContent, RecordFile, SignRecord } from './schema.ts'

export class RecordValidationError extends Error {
  readonly issues: readonly { path: string, message: string }[]

  constructor (what: string, issues: v.BaseIssue<unknown>[]) {
    const listed = issues.map(issue => ({ path: v.getDotPath(issue) ?? '(root)', message: issue.message }))
    super(`invalid ${what}:\n${listed.map(x => `  ${x.path}: ${x.message}`).join('\n')}`)
    this.name = 'RecordValidationError'
    this.issues = listed
  }
}

function validator<T extends v.GenericSchema> (schema: T, what: string) {
  return (value: unknown): v.InferOutput<T> => {
    const result = v.safeParse(schema, value)
    if (!result.success) throw new RecordValidationError(what, result.issues)
    return result.output
  }
}

export const validateContent = validator(RecordContent, 'record content')
export const validateRecord = validator(SignRecord, 'sign record')
export const validateRecordFile = validator(RecordFile, 'record file')
