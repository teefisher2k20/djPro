import sqlite3 from 'sqlite3';
import { open, Database, Statement } from 'sqlite'; // Import Statement
import path from 'path';
import { app } from 'electron'; // Electron's app for user data path
import { Track, Playlist, LibraryFilters } from '../types';

export class DatabaseService {
  // Fix: Explicitly type `db` with generic parameters for sqlite.Database and Statement
  private db: Database<sqlite3.Database, Statement> | null = null;
  private dbPath: string;

  constructor() {
    // Store database in user data directory for Electron app
    this.dbPath = path.join(app.getPath('userData'), 'dj_software.sqlite');
    console.log(`Database path: ${this.dbPath}`);
  }

  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database,
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        genre TEXT,
        bpm INTEGER,
        key TEXT,
        duration REAL,
        filePath TEXT UNIQUE NOT NULL,
        rating INTEGER,
        color TEXT,
        lastPlayed INTEGER,
        dateAdded INTEGER,
        tags TEXT, -- JSON string
        comments TEXT
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        dateCreated INTEGER
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlistId TEXT NOT NULL,
        trackId TEXT NOT NULL,
        "order" INTEGER NOT NULL,
        PRIMARY KEY (playlistId, trackId),
        FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE
      );
    `);
  }

  async getTracks(): Promise<Track[]> {
    if (!this.db) await this.init();
    // Fix: db.all now correctly accepts type arguments after `db` is properly typed
    const rows = await this.db!.all('SELECT * FROM tracks ORDER BY dateAdded DESC') as Track[];
    return rows.map(row => ({
      ...row,
      // Fix: Add `as unknown as string` to explicitly convert the type for JSON.parse
      tags: row.tags ? JSON.parse(row.tags as unknown as string) : [],
    }));
  }

  async saveTrack(track: Track): Promise<void> {
    if (!this.db) await this.init();
    try {
      await this.db!.run(
        `INSERT INTO tracks (id, name, artist, album, genre, bpm, key, duration, filePath, rating, color, lastPlayed, dateAdded, tags, comments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        track.id,
        track.name,
        track.artist || null,
        track.album || null,
        track.genre || null,
        track.bpm || null,
        track.key || null,
        track.duration || null,
        track.filePath,
        track.rating || 0,
        track.color || null,
        track.lastPlayed || 0,
        track.dateAdded || Date.now(),
        JSON.stringify(track.tags || []),
        track.comments || null
      );
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed: tracks.filePath')) {
        console.warn(`Track with filePath ${track.filePath} already exists. Skipping.`);
      } else {
        throw error;
      }
    }
  }

  async updateTrack(track: Partial<Track>): Promise<void> {
    if (!this.db) await this.init();
    const fields = Object.keys(track)
      .filter(key => key !== 'id' && key !== 'filePath' && key !== 'buffer' && key !== 'audioBuffer' && key !== 'waveformPeaks') // Exclude non-updatable or non-DB fields
      .map(key => {
        if (key === 'tags') {
            return `${key} = '${JSON.stringify((track as any)[key])}'`;
        }
        return `${key} = ?`;
      })
      .join(', ');
    const values = Object.keys(track)
      .filter(key => key !== 'id' && key !== 'filePath' && key !== 'buffer' && key !== 'audioBuffer' && key !== 'waveformPeaks' && key !== 'tags')
      .map(key => (track as any)[key]);

    if (fields.length === 0 || !track.id) {
        console.warn('No valid fields to update or track ID missing.');
        return;
    }
    await this.db!.run(`UPDATE tracks SET ${fields} WHERE id = ?`, ...values, track.id);
  }

  async deleteTrack(trackId: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM tracks WHERE id = ?', trackId);
  }

  async searchTracks(query: string, filters: LibraryFilters = {}): Promise<Track[]> {
    if (!this.db) await this.init();
    let sql = 'SELECT * FROM tracks WHERE 1=1';
    const params: any[] = [];

    if (query) {
      sql += ' AND (name LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ? OR comments LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    if (filters.bpmMin !== undefined && filters.bpmMin !== null) {
      sql += ' AND bpm >= ?';
      params.push(filters.bpmMin);
    }
    if (filters.bpmMax !== undefined && filters.bpmMax !== null) {
      sql += ' AND bpm <= ?';
      params.push(filters.bpmMax);
    }
    if (filters.key) {
      sql += ' AND key = ?';
      params.push(filters.key);
    }
    if (filters.genre) {
      sql += ' AND genre LIKE ?';
      params.push(`%${filters.genre}%`);
    }
    if (filters.ratingMin !== undefined && filters.ratingMin !== null) {
      sql += ' AND rating >= ?';
      params.push(filters.ratingMin);
    }

    // Fix: db.all now correctly accepts type arguments after `db` is properly typed
    const rows = await this.db!.all(sql + ' ORDER BY name COLLATE NOCASE', params) as Track[];
    return rows.map(row => ({
      ...row,
      // Fix: Add `as unknown as string` to explicitly convert the type for JSON.parse
      tags: row.tags ? JSON.parse(row.tags as unknown as string) : [],
    }));
  }

  async getPlaylists(): Promise<Playlist[]> {
    if (!this.db) await this.init();
    // Fix: db.all now correctly accepts type arguments after `db` is properly typed
    return this.db!.all('SELECT * FROM playlists ORDER BY name COLLATE NOCASE') as Playlist[];
  }

  async createPlaylist(name: string): Promise<void> {
    if (!this.db) await this.init();
    const id = crypto.randomUUID();
    await this.db!.run('INSERT INTO playlists (id, name, dateCreated) VALUES (?, ?, ?)', id, name, Date.now());
  }

  async deletePlaylist(playlistId: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM playlists WHERE id = ?', playlistId);
  }

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    if (!this.db) await this.init();
    // Fix: db.get now correctly accepts type arguments after `db` is properly typed
    const lastOrderRow = await this.db!.get('SELECT MAX("order") as maxOrder FROM playlist_tracks WHERE playlistId = ?', playlistId) as { maxOrder: number | null } | undefined;
    const newOrder = (lastOrderRow?.maxOrder || 0) + 1;
    try {
        await this.db!.run('INSERT INTO playlist_tracks (playlistId, trackId, "order") VALUES (?, ?, ?)', playlistId, trackId, newOrder);
    } catch (error: any) {
        if (error.message.includes('UNIQUE constraint failed: playlist_tracks.playlistId, playlist_tracks.trackId')) {
            console.warn(`Track ${trackId} already exists in playlist ${playlistId}. Skipping.`);
        } else {
            throw error;
        }
    }
  }

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?', playlistId, trackId);
  }

  async getTracksInPlaylist(playlistId: string): Promise<Track[]> {
    if (!this.db) await this.init();
    // Fix: db.all now correctly accepts type arguments after `db` is properly typed
    const rows = await this.db!.all(
      `SELECT t.* FROM tracks t
       INNER JOIN playlist_tracks pt ON t.id = pt.trackId
       WHERE pt.playlistId = ?
       ORDER BY pt."order"`,
      playlistId
    ) as Track[];
    return rows.map(row => ({
      ...row,
      // Fix: Add `as unknown as string` to explicitly convert the type for JSON.parse
      tags: row.tags ? JSON.parse(row.tags as unknown as string) : [],
    }));
  }
}