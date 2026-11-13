import { promises as fs } from 'node:fs';
import type { Request } from 'express';

type DestinationCallback = (
  error: Error | null,
  destination: string,
) => void;

export function createUploadDestination(directory: string) {
  return (
    _request: Request,
    _file: Express.Multer.File,
    callback: DestinationCallback,
  ): void => {
    void fs
      .mkdir(directory, { recursive: true })
      .then(() => callback(null, directory))
      .catch((error: Error) => callback(error, directory));
  };
}
