import csv from "csv-parser";
import { Readable } from "stream";

export async function parseCSV(file: File) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder().decode(buffer);

  return new Promise((resolve, reject) => {
    const results: any[] = [];
    let headers: string[] = [];
    let isFirstRow = true;

    const stream = Readable.from(text);

    stream
      .pipe(csv())
      .on("headers", (headerList: string[]) => {
        headers = headerList;
      })
      .on("data", (data: any) => {
        if (isFirstRow) {
          isFirstRow = false;
        }
        results.push(data);
      })
      .on("end", () => {
        resolve({
          headers,
          data: results,
          rowCount: results.length,
        });
      })
      .on("error", (error: Error) => {
        reject(new Error(`Error parsing CSV: ${error.message}`));
      });
  });
}
