import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
  ForeignKey,
  NonAttribute,
} from 'sequelize';
import { sequelize } from '../../../db/sequelize';
import type { User } from '../../control/user/user-model';

export type MediaKind = 'video' | 'image' | 'file';
/** pending: upload URL issued. ready: confirmed. orphaned: row kept because its
 *  R2 object could not be deleted yet (reclaimed later by /media/cleanup). */
export type MediaStatus = 'pending' | 'ready' | 'orphaned';
/** HLS transcode state for a video: none → processing → ready | failed. */
export type HlsStatus = 'none' | 'processing' | 'ready' | 'failed';

/**
 * A file stored in R2. Rows are created when an upload URL is issued (`pending`)
 * and marked `ready` once the client confirms the upload. `storageKey` is the
 * private object key and is never returned to clients.
 */
export class MediaAsset extends Model<
  InferAttributes<MediaAsset>,
  InferCreationAttributes<MediaAsset>
> {
  declare id: CreationOptional<number>;
  declare storageKey: string;
  declare kind: MediaKind;
  declare contentType: string;
  declare originalName: CreationOptional<string | null>;
  declare sizeBytes: CreationOptional<number | null>;
  declare status: CreationOptional<MediaStatus>;
  /** Nullable so deleting the uploader (SET NULL) doesn't drop assets still in use. */
  declare uploadedById: CreationOptional<ForeignKey<number> | null>;
  /** Encrypted-HLS transcode (video only). */
  declare hlsStatus: CreationOptional<HlsStatus>;
  /** Base64 of the 16-byte AES-128 key, served only via a gated ticket; never serialized. */
  declare hlsKeyB64: CreationOptional<string | null>;
  /** R2 key of the stored HLS playlist (index.m3u8). */
  declare hlsPlaylistKey: CreationOptional<string | null>;
  /** R2 prefix holding the HLS playlist + segments (for presigning & cleanup). */
  declare hlsPrefix: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare uploader?: NonAttribute<User>;

  /** Never expose the private object key or the AES key to clients. */
  toJSON(): object {
    const values = { ...this.get() } as Record<string, unknown>;
    delete values.storageKey;
    delete values.hlsKeyB64;
    delete values.hlsPlaylistKey;
    delete values.hlsPrefix;
    return values;
  }
}

MediaAsset.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    storageKey: { type: DataTypes.STRING, allowNull: false, unique: true },
    kind: {
      type: DataTypes.ENUM('video', 'image', 'file'),
      allowNull: false,
    },
    contentType: { type: DataTypes.STRING, allowNull: false },
    originalName: { type: DataTypes.STRING, allowNull: true },
    sizeBytes: { type: DataTypes.BIGINT, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'ready', 'orphaned'),
      allowNull: false,
      defaultValue: 'pending',
    },
    uploadedById: { type: DataTypes.BIGINT, allowNull: true },
    hlsStatus: {
      type: DataTypes.ENUM('none', 'processing', 'ready', 'failed'),
      allowNull: false,
      defaultValue: 'none',
    },
    hlsKeyB64: { type: DataTypes.STRING, allowNull: true },
    hlsPlaylistKey: { type: DataTypes.STRING, allowNull: true },
    hlsPrefix: { type: DataTypes.STRING, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: 'MediaAsset',
    tableName: 'media_assets',
    timestamps: true,
    indexes: [{ fields: ['uploadedById'] }],
  }
);

export default MediaAsset;
