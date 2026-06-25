import { type UdfDocument } from './model/types';
import { serialize } from './serialize/serialize';
import { parse } from './parse/parse';
import { packUdf, unpackContentXml } from './package/zip';
import { validateContentXml, type ValidationResult } from './validate/validate';

export * from './model/types';
export { UdfParseError } from './parse/parse';
export { UdfPackageError } from './package/zip';
export type { ValidationResult } from './validate/validate';

export function writeUdf(doc: UdfDocument): Uint8Array {
  return packUdf(serialize(doc));
}

export function readUdf(udf: Uint8Array): UdfDocument {
  return parse(unpackContentXml(udf));
}

export function serializeToXml(doc: UdfDocument): string {
  return serialize(doc);
}

export function validate(udf: Uint8Array): ValidationResult {
  return validateContentXml(unpackContentXml(udf));
}
