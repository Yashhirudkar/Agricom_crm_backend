export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  /**
   * Returns the full file path or URL for a given relative path/filename
   */
  resolvePath(path: string): string;

  /**
   * Deletes a file from storage
   */
  deleteFile(path: string): Promise<void>;

  /**
   * The name of the storage disk (e.g., 'local', 's3')
   */
  get diskName(): string;
}
