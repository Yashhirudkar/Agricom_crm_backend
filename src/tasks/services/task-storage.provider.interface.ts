export interface IStorageProvider {
  uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<string>;
  deleteFile(fileUrl: string): Promise<boolean>;
  validateFile(mimeType: string, size: number): boolean;
}
