type FileTypeModule = typeof import("file-type");

let fileTypeModulePromise: Promise<FileTypeModule> | null = null;

async function loadFileTypeModule(): Promise<FileTypeModule> {
  fileTypeModulePromise ??= import("file-type");
  return await fileTypeModulePromise;
}

export async function fileTypeFromBufferRuntime(buffer: Buffer) {
  const { fileTypeFromBuffer } = await loadFileTypeModule();
  return await fileTypeFromBuffer(buffer);
}
