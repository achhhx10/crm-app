declare module 'multer' {
  import { Request } from 'express';
  namespace multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
    }
    interface Multer {
      single(fieldname: string): (req: Request, res: any, next: any) => void;
    }
  }
  function multer(options?: any): multer.Multer;
  export = multer;
}
