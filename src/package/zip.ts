import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export class UdfPackageError extends Error {}

export function packUdf(contentXml: string): Uint8Array {
  return zipSync({ 'content.xml': strToU8(contentXml) });
}

export function unpackContentXml(udf: Uint8Array): string {
  let files;
  try {
    files = unzipSync(udf);
  } catch (e) {
    throw new UdfPackageError(`Not a valid .udf (zip) archive: ${(e as Error).message}`);
  }
  const entry = files['content.xml'];
  if (!entry) {
    throw new UdfPackageError(
      `content.xml not found in .udf archive (entries: ${Object.keys(files).join(', ') || 'none'})`,
    );
  }
  return strFromU8(entry);
}
