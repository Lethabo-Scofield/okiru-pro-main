import { aql, Database } from 'arangojs';
import { getArangoDB } from '../connection.js';
import { COLLECTIONS } from '../collections.js';

export interface ToolkitFile {
  _key?: string;
  _id?: string;
  name: string;
  sectorCode: string;
  scorecardType: string;
  sizeBytes: number;
  uploadedAt: string;
  data: string; // base64 encoded binary data
  contentType: string;
}

export class ToolkitFileRepository {
  private get db(): Database {
    return getArangoDB();
  }

  constructor() {}

  /**
   * Save a new toolkit file to ArangoDB, replacing any existing file
   * for the same sectorCode + scorecardType combination.
   */
  async saveToolkitFile(file: ToolkitFile): Promise<string> {
    const col = this.db.collection(COLLECTIONS.toolkitFiles);
    
    // Check if one already exists for this sector/type
    const cursor = await this.db.query(aql`
      FOR f IN ${col}
        FILTER f.sectorCode == ${file.sectorCode} AND f.scorecardType == ${file.scorecardType}
        RETURN f._key
    `);
    
    const existingKeys = await cursor.all();
    
    if (existingKeys.length > 0) {
      // Replace existing
      await col.replace(existingKeys[0], file);
      return existingKeys[0];
    } else {
      // Insert new
      const result = await col.save(file);
      return result._key;
    }
  }

  /**
   * Get a toolkit file by sector code and scorecard type
   * (Does not return the base64 data to keep payload small, unless requested)
   */
  async getToolkitFileMetadata(sectorCode: string, scorecardType: string): Promise<Partial<ToolkitFile> | null> {
    const col = this.db.collection(COLLECTIONS.toolkitFiles);
    const cursor = await this.db.query(aql`
      FOR f IN ${col}
        FILTER f.sectorCode == ${sectorCode} AND f.scorecardType == ${scorecardType}
        RETURN KEEP(f, "_key", "_id", "name", "sectorCode", "scorecardType", "sizeBytes", "uploadedAt", "contentType")
    `);
    
    const files = await cursor.all();
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get all toolkit files metadata
   */
  async getAllToolkitFilesMetadata(): Promise<Partial<ToolkitFile>[]> {
    const col = this.db.collection(COLLECTIONS.toolkitFiles);
    const cursor = await this.db.query(aql`
      FOR f IN ${col}
        SORT f.uploadedAt DESC
        RETURN KEEP(f, "_key", "_id", "name", "sectorCode", "scorecardType", "sizeBytes", "uploadedAt", "contentType")
    `);
    
    return await cursor.all();
  }

  /**
   * Get the full toolkit file including binary data by key
   */
  async getToolkitFileByKey(key: string): Promise<ToolkitFile | null> {
    const col = this.db.collection(COLLECTIONS.toolkitFiles);
    try {
      if (await col.documentExists(key)) {
        return await col.document(key);
      }
      return null;
    } catch {
      return null;
    }
  }
}
