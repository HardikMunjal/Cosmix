import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';

const { Pool } = require('pg');

type ChatKind = 'group' | 'dm';
type FriendshipStatus = 'pending' | 'accepted';
type GroupRole = 'owner' | 'admin' | 'member' | 'viewer';

type GroupSettingsRecord = {
    id: string;
    groupId: string;
    allowJoinByLink: boolean;
    clearMessagesAfterHours: number | null;
    onlyAdminsCreateFolders: boolean;
    onlyAdminsBookmarkMessages: boolean;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
};

type GroupFolderRecord = {
    id: string;
    groupId: string;
    name: string;
    description: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

type GroupFolderItemRecord = {
    id: string;
    groupId: string;
    folderId: string;
    messageId: string | null;
    imageId: string | null;
    note: string;
    createdBy: string;
    createdAt: string;
};

type GroupBookmarkRecord = {
    id: string;
    groupId: string;
    messageId: string;
    bookmarkedBy: string;
    note: string;
    createdAt: string;
};

type ChatActor = {
    username: string;
    userId?: string | null;
    avatar?: string | null;
};

type ChatTarget = {
    type: ChatKind;
    id?: string;
    name: string;
};

type ChatMessagePayload = {
    type: 'text' | 'gif';
    text?: string;
    gif?: string;
    chat: ChatTarget;
    timestamp?: string;
    user?: string;
    userId?: string | null;
    avatar?: string | null;
};

type FriendshipRecord = {
    id: string;
    userA: string;
    userB: string;
    requestedBy: string;
    status: FriendshipStatus;
    createdAt: string;
    updatedAt: string;
};

type GroupRecord = {
    id: string;
    name: string;
    slug: string;
    description: string;
    parentGroupId: string | null;
    createdBy: string;
    shareToken: string;
    createdAt: string;
    updatedAt: string;
};

type GroupMembershipRecord = {
    id: string;
    groupId: string;
    username: string;
    role: GroupRole;
    canView: boolean;
    canPost: boolean;
    canComment: boolean;
    canInvite: boolean;
    createdAt: string;
    updatedAt: string;
};

type GroupImageRecord = {
    id: string;
    groupId: string;
    imageUrl: string;
    s3Key: string;
    caption: string;
    uploadedBy: string;
    createdAt: string;
    updatedAt: string;
};

type GroupImageCommentRecord = {
    id: string;
    imageId: string;
    groupId: string;
    body: string;
    commentedBy: string;
    parentCommentId: string | null;
    createdAt: string;
    updatedAt: string;
};

type GroupMembershipView = {
    username: string;
    role: GroupRole;
    canView: boolean;
    canPost: boolean;
    canComment: boolean;
    canInvite: boolean;
};

type GroupImageCommentView = {
    id: string;
    imageId: string;
    groupId: string;
    body: string;
    commentedBy: string;
    parentCommentId: string | null;
    createdAt: string;
};

type GroupImageView = {
    id: string;
    groupId: string;
    imageUrl: string;
    s3Key: string;
    caption: string;
    uploadedBy: string;
    createdAt: string;
    comments: GroupImageCommentView[];
};

type GroupView = {
    id: string;
    name: string;
    slug: string;
    description: string;
    parentGroupId: string | null;
    createdBy: string;
    shareToken: string;
    createdAt: string;
    memberships: GroupMembershipView[];
    images: GroupImageView[];
    settings: {
        allowJoinByLink: boolean;
        clearMessagesAfterHours: number | null;
        onlyAdminsCreateFolders: boolean;
        onlyAdminsBookmarkMessages: boolean;
    };
    folders: Array<{
        id: string;
        name: string;
        description: string;
        createdBy: string;
        createdAt: string;
        items: Array<{
            id: string;
            messageId: string | null;
            imageId: string | null;
            note: string;
            createdBy: string;
            createdAt: string;
        }>;
    }>;
    bookmarks: Array<{
        id: string;
        messageId: string;
        bookmarkedBy: string;
        note: string;
        createdAt: string;
    }>;
};

type BootstrapPayload = {
    friends: string[];
    incomingRequests: string[];
    outgoingRequests: string[];
    groups: GroupView[];
};

type FriendshipRow = {
    user_a: string;
    user_b: string;
    requested_by: string;
    status: FriendshipStatus;
};

type GroupRow = {
    id: string;
    name: string;
    slug: string;
    description: string;
    parent_group_id: string | null;
    created_by: string;
    share_token: string;
    created_at: Date;
    updated_at: Date;
};

type GroupMembershipRow = {
    id: string;
    group_id: string;
    username: string;
    role: GroupRole;
    can_view: boolean;
    can_post: boolean;
    can_comment: boolean;
    can_invite: boolean;
    created_at: Date;
    updated_at: Date;
};

type GroupImageRow = {
    id: string;
    group_id: string;
    image_url: string;
    s3_key: string;
    caption: string;
    uploaded_by: string;
    created_at: Date;
    updated_at: Date;
};

type GroupImageCommentRow = {
    id: string;
    image_id: string;
    group_id: string;
    body: string;
    commented_by: string;
    parent_comment_id: string | null;
    created_at: Date;
    updated_at: Date;
};

type GroupSettingsRow = {
    id: string;
    group_id: string;
    allow_join_by_link: boolean;
    clear_messages_after_hours: number | null;
    only_admins_create_folders: boolean;
    only_admins_bookmark_messages: boolean;
    updated_by: string;
    created_at: Date;
    updated_at: Date;
};

type GroupFolderRow = {
    id: string;
    group_id: string;
    name: string;
    description: string;
    created_by: string;
    created_at: Date;
    updated_at: Date;
};

type GroupFolderItemRow = {
    id: string;
    group_id: string;
    folder_id: string;
    message_id: string | null;
    image_id: string | null;
    note: string;
    created_by: string;
    created_at: Date;
};

type GroupBookmarkRow = {
    id: string;
    group_id: string;
    message_id: string;
    bookmarked_by: string;
    note: string;
    created_at: Date;
};

type ChatMessageRow = {
    payload: any;
};

const GENERAL_GROUP_ID = 'general';

@Injectable()
export class ChatService {
    private readonly databaseUrl = process.env.DATABASE_URL || '';
    private pool: any = null;
    private schemaPromise: Promise<unknown> | null = null;
    private messages: any[] = [];
    private friendships: FriendshipRecord[] = [];
    private groups: GroupRecord[] = [];
    private memberships: GroupMembershipRecord[] = [];
    private images: GroupImageRecord[] = [];
    private comments: GroupImageCommentRecord[] = [];
    private groupSettings: GroupSettingsRecord[] = [];
    private folders: GroupFolderRecord[] = [];
    private folderItems: GroupFolderItemRecord[] = [];
    private bookmarks: GroupBookmarkRecord[] = [];

    private hasDatabase() {
        return Boolean(this.databaseUrl);
    }

    private getPool() {
        if (!this.hasDatabase()) return null;
        if (!this.pool) {
            this.pool = new Pool({ connectionString: this.databaseUrl });
        }
        return this.pool;
    }

    private nowIso() {
        return new Date().toISOString();
    }

    private normalizeUsername(value: string) {
        const trimmed = String(value || '').trim();
        if (!trimmed) throw new BadRequestException('Username is required.');
        return trimmed;
    }

    private canonicalPair(left: string, right: string) {
        const names = [this.normalizeUsername(left), this.normalizeUsername(right)].sort((a, b) => a.localeCompare(b));
        return { userA: names[0], userB: names[1] };
    }

    private buildId(prefix: string) {
        return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }

    private buildDmId(left: string, right: string) {
        const pair = this.canonicalPair(left, right);
        return `dm:${pair.userA.toLowerCase()}::${pair.userB.toLowerCase()}`;
    }

    private slugify(value: string) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'group';
    }

    private buildShareToken() {
        return crypto.randomBytes(8).toString('hex');
    }

    private rolePermissions(role: GroupRole) {
        switch (role) {
            case 'owner':
            case 'admin':
                return { canView: true, canPost: true, canComment: true, canInvite: true };
            case 'member':
                return { canView: true, canPost: true, canComment: true, canInvite: false };
            default:
                return { canView: true, canPost: false, canComment: true, canInvite: false };
        }
    }

    private defaultGroupSettings(groupId: string, actorUsername: string): GroupSettingsRecord {
        const now = this.nowIso();
        return {
            id: this.buildId('group-settings'),
            groupId,
            allowJoinByLink: true,
            clearMessagesAfterHours: null,
            onlyAdminsCreateFolders: false,
            onlyAdminsBookmarkMessages: false,
            updatedBy: this.normalizeUsername(actorUsername),
            createdAt: now,
            updatedAt: now,
        };
    }

    private memoryGroupSettings(groupId: string) {
        return this.groupSettings.find((settings) => settings.groupId === groupId) || null;
    }

    private async getGroupSettings(groupId: string): Promise<GroupSettingsRecord | null> {
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query('SELECT * FROM chat_group_settings WHERE group_id = $1 LIMIT 1', [groupId]);
            const row = (result?.rows?.[0] || null) as GroupSettingsRow | null;
            if (!row) return null;
            return {
                id: row.id,
                groupId: row.group_id,
                allowJoinByLink: row.allow_join_by_link,
                clearMessagesAfterHours: row.clear_messages_after_hours,
                onlyAdminsCreateFolders: row.only_admins_create_folders,
                onlyAdminsBookmarkMessages: row.only_admins_bookmark_messages,
                updatedBy: row.updated_by,
                createdAt: row.created_at.toISOString(),
                updatedAt: row.updated_at.toISOString(),
            };
        }
        return this.memoryGroupSettings(groupId);
    }

    private async assertGroupOwner(username: string, groupId: string) {
        const normalizedUsername = this.normalizeUsername(username);
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                `SELECT role
                 FROM chat_group_memberships
                 WHERE group_id = $1 AND username = $2
                 LIMIT 1`,
                [groupId, normalizedUsername],
            );
            const role = result?.rows?.[0]?.role as GroupRole | undefined;
            if (role !== 'owner') {
                throw new ForbiddenException('Only group owner can manage group security settings.');
            }
            return;
        }

        const membership = this.memoryMembership(groupId, normalizedUsername);
        if (!membership || membership.role !== 'owner') {
            throw new ForbiddenException('Only group owner can manage group security settings.');
        }
    }

    private async assertGroupManagementPermission(username: string, groupId: string, action: 'folder' | 'bookmark') {
        const normalizedUsername = this.normalizeUsername(username);
        const settings = await this.getGroupSettings(groupId);

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const membershipResult = await pool?.query(
                'SELECT role, can_view FROM chat_group_memberships WHERE group_id = $1 AND username = $2 LIMIT 1',
                [groupId, normalizedUsername],
            );
            const membership = membershipResult?.rows?.[0];
            if (!membership?.can_view) {
                throw new ForbiddenException('You do not have access to this group.');
            }
            const role = membership.role as GroupRole;
            const onlyAdmins = action === 'folder'
                ? settings?.onlyAdminsCreateFolders
                : settings?.onlyAdminsBookmarkMessages;
            if (onlyAdmins && role !== 'owner' && role !== 'admin') {
                throw new ForbiddenException('Only admins and owner can perform this action in this group.');
            }
            return;
        }

        const membership = this.memoryMembership(groupId, normalizedUsername);
        if (!membership || !membership.canView) {
            throw new ForbiddenException('You do not have access to this group.');
        }
        const onlyAdmins = action === 'folder'
            ? settings?.onlyAdminsCreateFolders
            : settings?.onlyAdminsBookmarkMessages;
        if (onlyAdmins && membership.role !== 'owner' && membership.role !== 'admin') {
            throw new ForbiddenException('Only admins and owner can perform this action in this group.');
        }
    }

    private async applyRetentionPolicy(groupId: string) {
        const settings = await this.getGroupSettings(groupId);
        const hours = Number(settings?.clearMessagesAfterHours || 0);
        if (!Number.isFinite(hours) || hours <= 0) return;
        const cutoffIso = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const deletedResult = await pool?.query(
                `DELETE FROM chat_messages
                 WHERE chat_type = 'group' AND chat_id = $1 AND created_at < $2
                 RETURNING id`,
                [groupId, cutoffIso],
            );
            const deletedMessageIds = ((deletedResult?.rows || []) as Array<{ id: string }>).map((row) => row.id);
            if (!deletedMessageIds.length) return;
            await pool?.query('DELETE FROM chat_message_bookmarks WHERE group_id = $1 AND message_id = ANY($2::text[])', [groupId, deletedMessageIds]);
            await pool?.query('DELETE FROM chat_group_folder_items WHERE group_id = $1 AND message_id = ANY($2::text[])', [groupId, deletedMessageIds]);
            return;
        }

        const deletedIds = new Set(
            this.messages
                .filter((message) => message.chat?.type === 'group' && message.chat?.id === groupId && String(message.timestamp || '') < cutoffIso)
                .map((message) => String(message.id || '')),
        );
        this.messages = this.messages.filter((message) => !(message.chat?.type === 'group' && message.chat?.id === groupId && String(message.timestamp || '') < cutoffIso));
        this.bookmarks = this.bookmarks.filter((bookmark) => !(bookmark.groupId === groupId && deletedIds.has(bookmark.messageId)));
        this.folderItems = this.folderItems.filter((item) => !(item.groupId === groupId && item.messageId && deletedIds.has(item.messageId)));
    }

    private buildMembershipRecord(groupId: string, username: string, role: GroupRole): GroupMembershipRecord {
        const permissions = this.rolePermissions(role);
        const now = this.nowIso();
        return {
            id: this.buildId('membership'),
            groupId,
            username: this.normalizeUsername(username),
            role,
            canView: permissions.canView,
            canPost: permissions.canPost,
            canComment: permissions.canComment,
            canInvite: permissions.canInvite,
            createdAt: now,
            updatedAt: now,
        };
    }

    private buildGroupView(
        group: GroupRecord,
        memberships: GroupMembershipRecord[],
        images: GroupImageRecord[],
        comments: GroupImageCommentRecord[],
        settings: GroupSettingsRecord | null,
        folders: GroupFolderRecord[],
        folderItems: GroupFolderItemRecord[],
        bookmarks: GroupBookmarkRecord[],
    ): GroupView {
        const commentsByImageId = new Map<string, GroupImageCommentView[]>();
        comments.forEach((comment) => {
            const current = commentsByImageId.get(comment.imageId) || [];
            current.push({
                id: comment.id,
                imageId: comment.imageId,
                groupId: comment.groupId,
                body: comment.body,
                commentedBy: comment.commentedBy,
                parentCommentId: comment.parentCommentId,
                createdAt: comment.createdAt,
            });
            commentsByImageId.set(comment.imageId, current.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
        });

        return {
            id: group.id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            parentGroupId: group.parentGroupId,
            createdBy: group.createdBy,
            shareToken: group.shareToken,
            createdAt: group.createdAt,
            memberships: memberships
                .slice()
                .sort((left, right) => left.username.localeCompare(right.username))
                .map((membership) => ({
                    username: membership.username,
                    role: membership.role,
                    canView: membership.canView,
                    canPost: membership.canPost,
                    canComment: membership.canComment,
                    canInvite: membership.canInvite,
                })),
            images: images
                .slice()
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                .map((image) => ({
                    id: image.id,
                    groupId: image.groupId,
                    imageUrl: image.imageUrl,
                    s3Key: image.s3Key,
                    caption: image.caption,
                    uploadedBy: image.uploadedBy,
                    createdAt: image.createdAt,
                    comments: commentsByImageId.get(image.id) || [],
                })),
            settings: {
                allowJoinByLink: settings?.allowJoinByLink ?? true,
                clearMessagesAfterHours: settings?.clearMessagesAfterHours ?? null,
                onlyAdminsCreateFolders: settings?.onlyAdminsCreateFolders ?? false,
                onlyAdminsBookmarkMessages: settings?.onlyAdminsBookmarkMessages ?? false,
            },
            folders: folders
                .slice()
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((folder) => ({
                    id: folder.id,
                    name: folder.name,
                    description: folder.description,
                    createdBy: folder.createdBy,
                    createdAt: folder.createdAt,
                    items: folderItems
                        .filter((item) => item.folderId === folder.id)
                        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                        .map((item) => ({
                            id: item.id,
                            messageId: item.messageId,
                            imageId: item.imageId,
                            note: item.note,
                            createdBy: item.createdBy,
                            createdAt: item.createdAt,
                        })),
                })),
            bookmarks: bookmarks
                .slice()
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
                .map((bookmark) => ({
                    id: bookmark.id,
                    messageId: bookmark.messageId,
                    bookmarkedBy: bookmark.bookmarkedBy,
                    note: bookmark.note,
                    createdAt: bookmark.createdAt,
                })),
        };
    }

    private memoryMembership(groupId: string, username: string) {
        return this.memberships.find((membership) => membership.groupId === groupId && membership.username === username) || null;
    }

    private async ensureSchema() {
        if (!this.hasDatabase()) return null;
        if (!this.schemaPromise) {
            const pool = this.getPool();
            this.schemaPromise = pool?.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    chat_type TEXT NOT NULL,
                    chat_id TEXT,
                    chat_name TEXT NOT NULL,
                    chat_label TEXT,
                    sender_user_id TEXT,
                    sender_name TEXT NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS chat_id TEXT;
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS chat_label TEXT;
                ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_user_id TEXT;

                CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_type, chat_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS chat_friendships (
                    id TEXT PRIMARY KEY,
                    user_a TEXT NOT NULL,
                    user_b TEXT NOT NULL,
                    requested_by TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_a, user_b)
                );

                CREATE INDEX IF NOT EXISTS idx_chat_friendships_user_a ON chat_friendships(user_a);
                CREATE INDEX IF NOT EXISTS idx_chat_friendships_user_b ON chat_friendships(user_b);

                CREATE TABLE IF NOT EXISTS chat_groups (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    parent_group_id TEXT,
                    created_by TEXT NOT NULL,
                    share_token TEXT NOT NULL UNIQUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_groups_parent ON chat_groups(parent_group_id);
                CREATE INDEX IF NOT EXISTS idx_chat_groups_created_by ON chat_groups(created_by);

                CREATE TABLE IF NOT EXISTS chat_group_memberships (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    role TEXT NOT NULL,
                    can_view BOOLEAN NOT NULL DEFAULT TRUE,
                    can_post BOOLEAN NOT NULL DEFAULT FALSE,
                    can_comment BOOLEAN NOT NULL DEFAULT TRUE,
                    can_invite BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(group_id, username)
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_memberships_group ON chat_group_memberships(group_id);
                CREATE INDEX IF NOT EXISTS idx_chat_group_memberships_user ON chat_group_memberships(username);

                CREATE TABLE IF NOT EXISTS chat_group_images (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    image_url TEXT NOT NULL,
                    s3_key TEXT NOT NULL,
                    caption TEXT NOT NULL DEFAULT '',
                    uploaded_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_images_group ON chat_group_images(group_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS chat_group_image_comments (
                    id TEXT PRIMARY KEY,
                    image_id TEXT NOT NULL,
                    group_id TEXT NOT NULL,
                    body TEXT NOT NULL,
                    commented_by TEXT NOT NULL,
                    parent_comment_id TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_image_comments_image ON chat_group_image_comments(image_id, created_at ASC);

                CREATE TABLE IF NOT EXISTS chat_group_settings (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL UNIQUE,
                    allow_join_by_link BOOLEAN NOT NULL DEFAULT TRUE,
                    clear_messages_after_hours INTEGER,
                    only_admins_create_folders BOOLEAN NOT NULL DEFAULT FALSE,
                    only_admins_bookmark_messages BOOLEAN NOT NULL DEFAULT FALSE,
                    updated_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_settings_group ON chat_group_settings(group_id);

                CREATE TABLE IF NOT EXISTS chat_group_folders (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(group_id, name)
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_folders_group ON chat_group_folders(group_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS chat_group_folder_items (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    folder_id TEXT NOT NULL,
                    message_id TEXT,
                    image_id TEXT,
                    note TEXT NOT NULL DEFAULT '',
                    created_by TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_chat_group_folder_items_folder ON chat_group_folder_items(folder_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_chat_group_folder_items_message ON chat_group_folder_items(group_id, message_id);

                CREATE TABLE IF NOT EXISTS chat_message_bookmarks (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    bookmarked_by TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(group_id, message_id, bookmarked_by)
                );

                CREATE INDEX IF NOT EXISTS idx_chat_message_bookmarks_group ON chat_message_bookmarks(group_id, created_at DESC);
            `);
        }
        await this.schemaPromise;
        return this.getPool();
    }

    private async assertFriendship(left: string, right: string) {
        const normalizedLeft = this.normalizeUsername(left);
        const normalizedRight = this.normalizeUsername(right);
        if (normalizedLeft === normalizedRight) return;

        const pair = this.canonicalPair(normalizedLeft, normalizedRight);
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                'SELECT status FROM chat_friendships WHERE user_a = $1 AND user_b = $2 LIMIT 1',
                [pair.userA, pair.userB],
            );
            if (result?.rows[0]?.status !== 'accepted') {
                throw new ForbiddenException('Direct messages are available only between buddies.');
            }
            return;
        }

        const friendship = this.friendships.find((entry) => entry.userA === pair.userA && entry.userB === pair.userB);
        if (friendship?.status !== 'accepted') {
            throw new ForbiddenException('Direct messages are available only between buddies.');
        }
    }

    private async assertGroupPermission(username: string, groupId: string, permission: 'view' | 'post' | 'comment' | 'invite') {
        if (groupId === GENERAL_GROUP_ID) {
            throw new ForbiddenException('Open workspace chat is disabled. Use a buddy or group conversation.');
        }

        const normalizedUsername = this.normalizeUsername(username);
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                `SELECT can_view, can_post, can_comment, can_invite
                 FROM chat_group_memberships
                 WHERE group_id = $1 AND username = $2 LIMIT 1`,
                [groupId, normalizedUsername],
            );
            const membership = result?.rows[0];
            if (!membership) {
                throw new ForbiddenException('You do not have access to this group.');
            }
            const allowed = permission === 'view'
                ? membership.can_view
                : permission === 'post'
                    ? membership.can_post
                    : permission === 'comment'
                        ? membership.can_comment
                        : membership.can_invite;
            if (!allowed) {
                throw new ForbiddenException('You do not have permission for this action in the group.');
            }
            return;
        }

        const membership = this.memoryMembership(groupId, normalizedUsername);
        if (!membership) {
            throw new ForbiddenException('You do not have access to this group.');
        }
        const allowed = permission === 'view'
            ? membership.canView
            : permission === 'post'
                ? membership.canPost
                : permission === 'comment'
                    ? membership.canComment
                    : membership.canInvite;
        if (!allowed) {
            throw new ForbiddenException('You do not have permission for this action in the group.');
        }
    }

    async getBootstrap(username: string): Promise<BootstrapPayload> {
        const normalizedUsername = this.normalizeUsername(username);
        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const friendshipsResult = await pool?.query(
                'SELECT * FROM chat_friendships WHERE user_a = $1 OR user_b = $1 ORDER BY updated_at DESC',
                [normalizedUsername],
            );
            const friendshipRows = (friendshipsResult?.rows || []) as FriendshipRow[];
            const visibleGroupIdsResult = await pool?.query(
                'SELECT group_id FROM chat_group_memberships WHERE username = $1 AND can_view = TRUE',
                [normalizedUsername],
            );
            const groupIds = ((visibleGroupIdsResult?.rows || []) as Array<{ group_id: string }>).map((row) => row.group_id);
            let groups: GroupView[] = [];
            if (groupIds.length) {
                const [groupsResult, membershipsResult, imagesResult] = await Promise.all([
                    pool?.query('SELECT * FROM chat_groups WHERE id = ANY($1::text[]) ORDER BY created_at DESC', [groupIds]),
                    pool?.query('SELECT * FROM chat_group_memberships WHERE group_id = ANY($1::text[]) ORDER BY created_at ASC', [groupIds]),
                    pool?.query('SELECT * FROM chat_group_images WHERE group_id = ANY($1::text[]) ORDER BY created_at DESC', [groupIds]),
                ]);
                const groupRows = (groupsResult?.rows || []) as GroupRow[];
                const membershipRows = (membershipsResult?.rows || []) as GroupMembershipRow[];
                const imageRows = (imagesResult?.rows || []) as GroupImageRow[];
                const imageIds = imageRows.map((row) => row.id);
                const [commentsResult, settingsResult, foldersResult, folderItemsResult, bookmarksResult] = await Promise.all([
                    imageIds.length
                        ? pool?.query('SELECT * FROM chat_group_image_comments WHERE image_id = ANY($1::text[]) ORDER BY created_at ASC', [imageIds])
                        : Promise.resolve({ rows: [] }),
                    pool?.query('SELECT * FROM chat_group_settings WHERE group_id = ANY($1::text[])', [groupIds]),
                    pool?.query('SELECT * FROM chat_group_folders WHERE group_id = ANY($1::text[]) ORDER BY created_at DESC', [groupIds]),
                    pool?.query('SELECT * FROM chat_group_folder_items WHERE group_id = ANY($1::text[]) ORDER BY created_at DESC', [groupIds]),
                    pool?.query('SELECT * FROM chat_message_bookmarks WHERE group_id = ANY($1::text[]) ORDER BY created_at DESC', [groupIds]),
                ]);
                const commentRows = (commentsResult?.rows || []) as GroupImageCommentRow[];
                const settingsRows = (settingsResult?.rows || []) as GroupSettingsRow[];
                const folderRows = (foldersResult?.rows || []) as GroupFolderRow[];
                const folderItemRows = (folderItemsResult?.rows || []) as GroupFolderItemRow[];
                const bookmarkRows = (bookmarksResult?.rows || []) as GroupBookmarkRow[];
                groups = groupRows.map((groupRow) => this.buildGroupView(
                    {
                        id: groupRow.id,
                        name: groupRow.name,
                        slug: groupRow.slug,
                        description: groupRow.description,
                        parentGroupId: groupRow.parent_group_id,
                        createdBy: groupRow.created_by,
                        shareToken: groupRow.share_token,
                        createdAt: groupRow.created_at.toISOString(),
                        updatedAt: groupRow.updated_at.toISOString(),
                    },
                    membershipRows.filter((membershipRow) => membershipRow.group_id === groupRow.id).map((membershipRow) => ({
                        id: membershipRow.id,
                        groupId: membershipRow.group_id,
                        username: membershipRow.username,
                        role: membershipRow.role,
                        canView: membershipRow.can_view,
                        canPost: membershipRow.can_post,
                        canComment: membershipRow.can_comment,
                        canInvite: membershipRow.can_invite,
                        createdAt: membershipRow.created_at.toISOString(),
                        updatedAt: membershipRow.updated_at.toISOString(),
                    })),
                    imageRows.filter((imageRow) => imageRow.group_id === groupRow.id).map((imageRow) => ({
                        id: imageRow.id,
                        groupId: imageRow.group_id,
                        imageUrl: imageRow.image_url,
                        s3Key: imageRow.s3_key,
                        caption: imageRow.caption,
                        uploadedBy: imageRow.uploaded_by,
                        createdAt: imageRow.created_at.toISOString(),
                        updatedAt: imageRow.updated_at.toISOString(),
                    })),
                    commentRows.filter((commentRow) => commentRow.group_id === groupRow.id).map((commentRow) => ({
                        id: commentRow.id,
                        imageId: commentRow.image_id,
                        groupId: commentRow.group_id,
                        body: commentRow.body,
                        commentedBy: commentRow.commented_by,
                        parentCommentId: commentRow.parent_comment_id,
                        createdAt: commentRow.created_at.toISOString(),
                        updatedAt: commentRow.updated_at.toISOString(),
                    })),
                    (() => {
                        const settingsRow = settingsRows.find((row) => row.group_id === groupRow.id);
                        if (!settingsRow) return null;
                        return {
                            id: settingsRow.id,
                            groupId: settingsRow.group_id,
                            allowJoinByLink: settingsRow.allow_join_by_link,
                            clearMessagesAfterHours: settingsRow.clear_messages_after_hours,
                            onlyAdminsCreateFolders: settingsRow.only_admins_create_folders,
                            onlyAdminsBookmarkMessages: settingsRow.only_admins_bookmark_messages,
                            updatedBy: settingsRow.updated_by,
                            createdAt: settingsRow.created_at.toISOString(),
                            updatedAt: settingsRow.updated_at.toISOString(),
                        };
                    })(),
                    folderRows.filter((folderRow) => folderRow.group_id === groupRow.id).map((folderRow) => ({
                        id: folderRow.id,
                        groupId: folderRow.group_id,
                        name: folderRow.name,
                        description: folderRow.description,
                        createdBy: folderRow.created_by,
                        createdAt: folderRow.created_at.toISOString(),
                        updatedAt: folderRow.updated_at.toISOString(),
                    })),
                    folderItemRows.filter((folderItemRow) => folderItemRow.group_id === groupRow.id).map((folderItemRow) => ({
                        id: folderItemRow.id,
                        groupId: folderItemRow.group_id,
                        folderId: folderItemRow.folder_id,
                        messageId: folderItemRow.message_id,
                        imageId: folderItemRow.image_id,
                        note: folderItemRow.note,
                        createdBy: folderItemRow.created_by,
                        createdAt: folderItemRow.created_at.toISOString(),
                    })),
                    bookmarkRows.filter((bookmarkRow) => bookmarkRow.group_id === groupRow.id).map((bookmarkRow) => ({
                        id: bookmarkRow.id,
                        groupId: bookmarkRow.group_id,
                        messageId: bookmarkRow.message_id,
                        bookmarkedBy: bookmarkRow.bookmarked_by,
                        note: bookmarkRow.note,
                        createdAt: bookmarkRow.created_at.toISOString(),
                    })),
                ));
            }

            return {
                friends: friendshipRows
                    .filter((entry) => entry.status === 'accepted')
                    .map((entry) => (entry.user_a === normalizedUsername ? entry.user_b : entry.user_a)),
                incomingRequests: friendshipRows
                    .filter((entry) => entry.status === 'pending' && entry.requested_by !== normalizedUsername)
                    .map((entry) => (entry.user_a === normalizedUsername ? entry.user_b : entry.user_a)),
                outgoingRequests: friendshipRows
                    .filter((entry) => entry.status === 'pending' && entry.requested_by === normalizedUsername)
                    .map((entry) => (entry.user_a === normalizedUsername ? entry.user_b : entry.user_a)),
                groups,
            };
        }

        const relevantFriendships = this.friendships.filter((entry) => entry.userA === normalizedUsername || entry.userB === normalizedUsername);
        const visibleGroups = this.groups
            .filter((group) => this.memoryMembership(group.id, normalizedUsername)?.canView)
            .map((group) => this.buildGroupView(
                group,
                this.memberships.filter((membership) => membership.groupId === group.id),
                this.images.filter((image) => image.groupId === group.id),
                this.comments.filter((comment) => comment.groupId === group.id),
                this.memoryGroupSettings(group.id),
                this.folders.filter((folder) => folder.groupId === group.id),
                this.folderItems.filter((item) => item.groupId === group.id),
                this.bookmarks.filter((bookmark) => bookmark.groupId === group.id),
            ));

        return {
            friends: relevantFriendships
                .filter((entry) => entry.status === 'accepted')
                .map((entry) => (entry.userA === normalizedUsername ? entry.userB : entry.userA)),
            incomingRequests: relevantFriendships
                .filter((entry) => entry.status === 'pending' && entry.requestedBy !== normalizedUsername)
                .map((entry) => (entry.userA === normalizedUsername ? entry.userB : entry.userA)),
            outgoingRequests: relevantFriendships
                .filter((entry) => entry.status === 'pending' && entry.requestedBy === normalizedUsername)
                .map((entry) => (entry.userA === normalizedUsername ? entry.userB : entry.userA)),
            groups: visibleGroups,
        };
    }

    async sendFriendRequest(actorUsername: string, targetUsername: string) {
        const requester = this.normalizeUsername(actorUsername);
        const addressee = this.normalizeUsername(targetUsername);
        if (requester === addressee) {
            throw new BadRequestException('You cannot add yourself as a buddy.');
        }
        const pair = this.canonicalPair(requester, addressee);
        const now = this.nowIso();

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `INSERT INTO chat_friendships (id, user_a, user_b, requested_by, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'pending', $5, $5)
                 ON CONFLICT (user_a, user_b) DO UPDATE
                 SET requested_by = EXCLUDED.requested_by,
                     status = CASE
                       WHEN chat_friendships.status = 'accepted' THEN 'accepted'
                       ELSE 'pending'
                     END,
                     updated_at = EXCLUDED.updated_at`,
                [this.buildId('friendship'), pair.userA, pair.userB, requester, now],
            );
            return this.getBootstrap(requester);
        }

        const existing = this.friendships.find((entry) => entry.userA === pair.userA && entry.userB === pair.userB);
        if (existing) {
            existing.requestedBy = requester;
            existing.status = existing.status === 'accepted' ? 'accepted' : 'pending';
            existing.updatedAt = now;
        } else {
            this.friendships.push({
                id: this.buildId('friendship'),
                userA: pair.userA,
                userB: pair.userB,
                requestedBy: requester,
                status: 'pending',
                createdAt: now,
                updatedAt: now,
            });
        }
        return this.getBootstrap(requester);
    }

    async acceptFriendRequest(actorUsername: string, requesterUsername: string) {
        const actor = this.normalizeUsername(actorUsername);
        const requester = this.normalizeUsername(requesterUsername);
        const pair = this.canonicalPair(actor, requester);
        const now = this.nowIso();

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                `UPDATE chat_friendships
                 SET status = 'accepted', updated_at = $3
                 WHERE user_a = $1 AND user_b = $2 AND status = 'pending'
                 RETURNING id`,
                [pair.userA, pair.userB, now],
            );
            if (!result?.rows[0]) {
                throw new NotFoundException('Buddy request not found.');
            }
            return this.getBootstrap(actor);
        }

        const existing = this.friendships.find((entry) => entry.userA === pair.userA && entry.userB === pair.userB && entry.status === 'pending');
        if (!existing) {
            throw new NotFoundException('Buddy request not found.');
        }
        existing.status = 'accepted';
        existing.updatedAt = now;
        return this.getBootstrap(actor);
    }

    async createGroup(
        actorUsername: string,
        payload: { name: string; description?: string; parentGroupId?: string | null; memberUsernames?: string[]; viewerUsernames?: string[] },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        const name = String(payload.name || '').trim();
        if (!name) {
            throw new BadRequestException('Group name is required.');
        }
        const now = this.nowIso();
        const groupId = this.buildId('group');
        const parentGroupId = payload.parentGroupId ? String(payload.parentGroupId) : null;

        if (parentGroupId) {
            await this.assertGroupPermission(actor, parentGroupId, 'invite');
        }

        const memberUsernames = Array.from(new Set((payload.memberUsernames || []).map((username) => this.normalizeUsername(username)).filter((username) => username !== actor)));
        const viewerUsernames = Array.from(new Set((payload.viewerUsernames || []).map((username) => this.normalizeUsername(username)).filter((username) => username !== actor && !memberUsernames.includes(username))));
        const groupRecord: GroupRecord = {
            id: groupId,
            name,
            slug: `${this.slugify(name)}-${groupId.slice(-6)}`,
            description: String(payload.description || '').trim(),
            parentGroupId,
            createdBy: actor,
            shareToken: this.buildShareToken(),
            createdAt: now,
            updatedAt: now,
        };

        const membershipRecords = [
            this.buildMembershipRecord(groupId, actor, 'owner'),
            ...memberUsernames.map((username) => this.buildMembershipRecord(groupId, username, 'member')),
            ...viewerUsernames.map((username) => this.buildMembershipRecord(groupId, username, 'viewer')),
        ];
        const defaultSettings = this.defaultGroupSettings(groupId, actor);

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `INSERT INTO chat_groups (id, name, slug, description, parent_group_id, created_by, share_token, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
                [groupRecord.id, groupRecord.name, groupRecord.slug, groupRecord.description, groupRecord.parentGroupId, groupRecord.createdBy, groupRecord.shareToken, groupRecord.createdAt],
            );
            for (const membership of membershipRecords) {
                await pool?.query(
                    `INSERT INTO chat_group_memberships (id, group_id, username, role, can_view, can_post, can_comment, can_invite, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
                     ON CONFLICT (group_id, username) DO UPDATE
                     SET role = EXCLUDED.role,
                         can_view = EXCLUDED.can_view,
                         can_post = EXCLUDED.can_post,
                         can_comment = EXCLUDED.can_comment,
                         can_invite = EXCLUDED.can_invite,
                         updated_at = EXCLUDED.updated_at`,
                    [membership.id, membership.groupId, membership.username, membership.role, membership.canView, membership.canPost, membership.canComment, membership.canInvite, membership.createdAt],
                );
            }
            await pool?.query(
                `INSERT INTO chat_group_settings (
                    id, group_id, allow_join_by_link, clear_messages_after_hours,
                    only_admins_create_folders, only_admins_bookmark_messages,
                    updated_by, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
                 ON CONFLICT (group_id) DO NOTHING`,
                [
                    defaultSettings.id,
                    defaultSettings.groupId,
                    defaultSettings.allowJoinByLink,
                    defaultSettings.clearMessagesAfterHours,
                    defaultSettings.onlyAdminsCreateFolders,
                    defaultSettings.onlyAdminsBookmarkMessages,
                    defaultSettings.updatedBy,
                    defaultSettings.createdAt,
                ],
            );
            return this.getBootstrap(actor);
        }

        this.groups.push(groupRecord);
        this.memberships.push(...membershipRecords);
        this.groupSettings.push(defaultSettings);
        return this.getBootstrap(actor);
    }

    async updateGroupAccess(
        actorUsername: string,
        groupId: string,
        payload: { memberUsernames?: string[]; viewerUsernames?: string[] },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupPermission(actor, groupId, 'invite');
        const memberUsernames = Array.from(new Set((payload.memberUsernames || []).map((username) => this.normalizeUsername(username)).filter((username) => username !== actor)));
        const viewerUsernames = Array.from(new Set((payload.viewerUsernames || []).map((username) => this.normalizeUsername(username)).filter((username) => username !== actor && !memberUsernames.includes(username))));
        const nextMemberships = [
            ...memberUsernames.map((username) => this.buildMembershipRecord(groupId, username, 'member')),
            ...viewerUsernames.map((username) => this.buildMembershipRecord(groupId, username, 'viewer')),
        ];

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `DELETE FROM chat_group_memberships
                 WHERE group_id = $1 AND role <> 'owner'`,
                [groupId],
            );
            for (const membership of nextMemberships) {
                await pool?.query(
                    `INSERT INTO chat_group_memberships (id, group_id, username, role, can_view, can_post, can_comment, can_invite, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
                    [membership.id, membership.groupId, membership.username, membership.role, membership.canView, membership.canPost, membership.canComment, membership.canInvite, membership.createdAt],
                );
            }
            await pool?.query('UPDATE chat_groups SET updated_at = $2 WHERE id = $1', [groupId, this.nowIso()]);
            return this.getBootstrap(actor);
        }

        this.memberships = this.memberships.filter((membership) => !(membership.groupId === groupId && membership.role !== 'owner'));
        this.memberships.push(...nextMemberships);
        return this.getBootstrap(actor);
    }

    async joinGroupByShareToken(actorUsername: string, shareToken: string) {
        const actor = this.normalizeUsername(actorUsername);
        const token = String(shareToken || '').trim();
        if (!token) {
            throw new BadRequestException('Group token is required.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const groupResult = await pool?.query('SELECT * FROM chat_groups WHERE share_token = $1 LIMIT 1', [token]);
            const group = groupResult?.rows[0];
            if (!group) {
                throw new NotFoundException('Group link is not valid.');
            }
            const settingsResult = await pool?.query('SELECT allow_join_by_link FROM chat_group_settings WHERE group_id = $1 LIMIT 1', [group.id]);
            const allowJoinByLink = settingsResult?.rows?.[0]?.allow_join_by_link;
            if (allowJoinByLink === false) {
                throw new ForbiddenException('Joining by link is disabled by group owner.');
            }
            const membership = this.buildMembershipRecord(group.id, actor, 'viewer');
            await pool?.query(
                `INSERT INTO chat_group_memberships (id, group_id, username, role, can_view, can_post, can_comment, can_invite, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
                 ON CONFLICT (group_id, username) DO NOTHING`,
                [membership.id, membership.groupId, membership.username, membership.role, membership.canView, membership.canPost, membership.canComment, membership.canInvite, membership.createdAt],
            );
            return this.getBootstrap(actor);
        }

        const group = this.groups.find((entry) => entry.shareToken === token);
        if (!group) {
            throw new NotFoundException('Group link is not valid.');
        }
        const settings = this.memoryGroupSettings(group.id);
        if (settings && settings.allowJoinByLink === false) {
            throw new ForbiddenException('Joining by link is disabled by group owner.');
        }
        if (!this.memoryMembership(group.id, actor)) {
            this.memberships.push(this.buildMembershipRecord(group.id, actor, 'viewer'));
        }
        return this.getBootstrap(actor);
    }

    async getGroupPublicByShareToken(shareToken: string) {
        const token = String(shareToken || '').trim();
        if (!token) {
            throw new BadRequestException('Group token is required.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                `SELECT g.id, g.name, g.description, g.share_token,
                        COALESCE(s.allow_join_by_link, TRUE) AS allow_join_by_link
                 FROM chat_groups g
                 LEFT JOIN chat_group_settings s ON s.group_id = g.id
                 WHERE g.share_token = $1
                 LIMIT 1`,
                [token],
            );
            const row = result?.rows?.[0];
            if (!row) {
                throw new NotFoundException('Group link is not valid.');
            }
            return {
                id: row.id,
                name: row.name,
                description: row.description || '',
                shareToken: row.share_token,
                allowJoinByLink: row.allow_join_by_link !== false,
            };
        }

        const group = this.groups.find((entry) => entry.shareToken === token);
        if (!group) {
            throw new NotFoundException('Group link is not valid.');
        }
        const settings = this.memoryGroupSettings(group.id);
        return {
            id: group.id,
            name: group.name,
            description: group.description,
            shareToken: group.shareToken,
            allowJoinByLink: settings?.allowJoinByLink !== false,
        };
    }

    async updateGroupSettings(
        actorUsername: string,
        groupId: string,
        payload: {
            allowJoinByLink?: boolean;
            clearMessagesAfterHours?: number | null;
            onlyAdminsCreateFolders?: boolean;
            onlyAdminsBookmarkMessages?: boolean;
        },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupOwner(actor, groupId);

        const clearMessagesAfterHours = payload.clearMessagesAfterHours == null || payload.clearMessagesAfterHours === ''
            ? null
            : Number(payload.clearMessagesAfterHours);
        if (clearMessagesAfterHours != null && (!Number.isFinite(clearMessagesAfterHours) || clearMessagesAfterHours < 1)) {
            throw new BadRequestException('Message retention hours must be at least 1, or empty to keep forever.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const now = this.nowIso();
            await pool?.query(
                `INSERT INTO chat_group_settings (
                    id, group_id, allow_join_by_link, clear_messages_after_hours,
                    only_admins_create_folders, only_admins_bookmark_messages,
                    updated_by, created_at, updated_at
                 ) VALUES ($1, $2, COALESCE($3, TRUE), $4, COALESCE($5, FALSE), COALESCE($6, FALSE), $7, $8, $8)
                 ON CONFLICT (group_id) DO UPDATE
                 SET allow_join_by_link = COALESCE($3, chat_group_settings.allow_join_by_link),
                     clear_messages_after_hours = $4,
                     only_admins_create_folders = COALESCE($5, chat_group_settings.only_admins_create_folders),
                     only_admins_bookmark_messages = COALESCE($6, chat_group_settings.only_admins_bookmark_messages),
                     updated_by = $7,
                     updated_at = $8`,
                [
                    this.buildId('group-settings'),
                    groupId,
                    payload.allowJoinByLink,
                    clearMessagesAfterHours,
                    payload.onlyAdminsCreateFolders,
                    payload.onlyAdminsBookmarkMessages,
                    actor,
                    now,
                ],
            );
            await this.applyRetentionPolicy(groupId);
            return this.getBootstrap(actor);
        }

        const existing = this.memoryGroupSettings(groupId);
        if (!existing) {
            this.groupSettings.push({
                ...this.defaultGroupSettings(groupId, actor),
                allowJoinByLink: payload.allowJoinByLink ?? true,
                clearMessagesAfterHours,
                onlyAdminsCreateFolders: payload.onlyAdminsCreateFolders ?? false,
                onlyAdminsBookmarkMessages: payload.onlyAdminsBookmarkMessages ?? false,
            });
        } else {
            existing.allowJoinByLink = payload.allowJoinByLink ?? existing.allowJoinByLink;
            existing.clearMessagesAfterHours = clearMessagesAfterHours;
            existing.onlyAdminsCreateFolders = payload.onlyAdminsCreateFolders ?? existing.onlyAdminsCreateFolders;
            existing.onlyAdminsBookmarkMessages = payload.onlyAdminsBookmarkMessages ?? existing.onlyAdminsBookmarkMessages;
            existing.updatedBy = actor;
            existing.updatedAt = this.nowIso();
        }
        await this.applyRetentionPolicy(groupId);
        return this.getBootstrap(actor);
    }

    async updateGroupMemberSecurity(
        actorUsername: string,
        groupId: string,
        targetUsername: string,
        payload: {
            role?: GroupRole;
            canView?: boolean;
            canPost?: boolean;
            canComment?: boolean;
            canInvite?: boolean;
        },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        const target = this.normalizeUsername(targetUsername);
        await this.assertGroupOwner(actor, groupId);

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const membershipResult = await pool?.query(
                'SELECT * FROM chat_group_memberships WHERE group_id = $1 AND username = $2 LIMIT 1',
                [groupId, target],
            );
            const membership = membershipResult?.rows?.[0];
            if (!membership) {
                throw new NotFoundException('Group member not found.');
            }
            if (membership.role === 'owner') {
                throw new ForbiddenException('Owner role cannot be modified.');
            }
            await pool?.query(
                `UPDATE chat_group_memberships
                 SET role = COALESCE($3, role),
                     can_view = COALESCE($4, can_view),
                     can_post = COALESCE($5, can_post),
                     can_comment = COALESCE($6, can_comment),
                     can_invite = COALESCE($7, can_invite),
                     updated_at = $8
                 WHERE group_id = $1 AND username = $2`,
                [
                    groupId,
                    target,
                    payload.role,
                    payload.canView,
                    payload.canPost,
                    payload.canComment,
                    payload.canInvite,
                    this.nowIso(),
                ],
            );
            return this.getBootstrap(actor);
        }

        const membership = this.memoryMembership(groupId, target);
        if (!membership) {
            throw new NotFoundException('Group member not found.');
        }
        if (membership.role === 'owner') {
            throw new ForbiddenException('Owner role cannot be modified.');
        }
        membership.role = payload.role ?? membership.role;
        membership.canView = payload.canView ?? membership.canView;
        membership.canPost = payload.canPost ?? membership.canPost;
        membership.canComment = payload.canComment ?? membership.canComment;
        membership.canInvite = payload.canInvite ?? membership.canInvite;
        membership.updatedAt = this.nowIso();
        return this.getBootstrap(actor);
    }

    async createGroupFolder(actorUsername: string, groupId: string, payload: { name: string; description?: string }) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupManagementPermission(actor, groupId, 'folder');
        const name = String(payload.name || '').trim();
        if (!name) {
            throw new BadRequestException('Folder name is required.');
        }
        const now = this.nowIso();
        const folder: GroupFolderRecord = {
            id: this.buildId('folder'),
            groupId,
            name,
            description: String(payload.description || '').trim(),
            createdBy: actor,
            createdAt: now,
            updatedAt: now,
        };

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `INSERT INTO chat_group_folders (id, group_id, name, description, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $6)`,
                [folder.id, folder.groupId, folder.name, folder.description, folder.createdBy, folder.createdAt],
            );
            return this.getBootstrap(actor);
        }

        this.folders.push(folder);
        return this.getBootstrap(actor);
    }

    async addFolderItem(
        actorUsername: string,
        groupId: string,
        folderId: string,
        payload: { messageId?: string | null; imageId?: string | null; note?: string },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupManagementPermission(actor, groupId, 'folder');
        const messageId = payload.messageId ? String(payload.messageId) : null;
        const imageId = payload.imageId ? String(payload.imageId) : null;
        if (!messageId && !imageId) {
            throw new BadRequestException('Provide either a messageId or imageId to save inside folder.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const folderResult = await pool?.query(
                'SELECT id FROM chat_group_folders WHERE id = $1 AND group_id = $2 LIMIT 1',
                [folderId, groupId],
            );
            if (!folderResult?.rows?.[0]) {
                throw new NotFoundException('Folder not found.');
            }
            if (messageId) {
                const messageResult = await pool?.query('SELECT id FROM chat_messages WHERE id = $1 AND chat_type = $2 AND chat_id = $3 LIMIT 1', [messageId, 'group', groupId]);
                if (!messageResult?.rows?.[0]) {
                    throw new NotFoundException('Message not found in this group.');
                }
            }
            if (imageId) {
                const imageResult = await pool?.query('SELECT id FROM chat_group_images WHERE id = $1 AND group_id = $2 LIMIT 1', [imageId, groupId]);
                if (!imageResult?.rows?.[0]) {
                    throw new NotFoundException('Image not found in this group.');
                }
            }
            await pool?.query(
                `INSERT INTO chat_group_folder_items (id, group_id, folder_id, message_id, image_id, note, created_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [this.buildId('folder-item'), groupId, folderId, messageId, imageId, String(payload.note || '').trim(), actor, this.nowIso()],
            );
            return this.getBootstrap(actor);
        }

        const folder = this.folders.find((entry) => entry.id === folderId && entry.groupId === groupId);
        if (!folder) {
            throw new NotFoundException('Folder not found.');
        }
        this.folderItems.push({
            id: this.buildId('folder-item'),
            groupId,
            folderId,
            messageId,
            imageId,
            note: String(payload.note || '').trim(),
            createdBy: actor,
            createdAt: this.nowIso(),
        });
        return this.getBootstrap(actor);
    }

    async addMessageBookmark(actorUsername: string, groupId: string, payload: { messageId: string; note?: string }) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupManagementPermission(actor, groupId, 'bookmark');
        const messageId = String(payload.messageId || '').trim();
        if (!messageId) {
            throw new BadRequestException('Message id is required.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const messageResult = await pool?.query('SELECT id FROM chat_messages WHERE id = $1 AND chat_type = $2 AND chat_id = $3 LIMIT 1', [messageId, 'group', groupId]);
            if (!messageResult?.rows?.[0]) {
                throw new NotFoundException('Message not found in this group.');
            }
            await pool?.query(
                `INSERT INTO chat_message_bookmarks (id, group_id, message_id, bookmarked_by, note, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (group_id, message_id, bookmarked_by) DO UPDATE
                 SET note = EXCLUDED.note,
                     created_at = EXCLUDED.created_at`,
                [this.buildId('bookmark'), groupId, messageId, actor, String(payload.note || '').trim(), this.nowIso()],
            );
            return this.getBootstrap(actor);
        }

        const message = this.messages.find((entry) => entry.id === messageId && entry.chat?.type === 'group' && entry.chat?.id === groupId);
        if (!message) {
            throw new NotFoundException('Message not found in this group.');
        }
        const existing = this.bookmarks.find((bookmark) => bookmark.groupId === groupId && bookmark.messageId === messageId && bookmark.bookmarkedBy === actor);
        if (existing) {
            existing.note = String(payload.note || '').trim();
            existing.createdAt = this.nowIso();
        } else {
            this.bookmarks.push({
                id: this.buildId('bookmark'),
                groupId,
                messageId,
                bookmarkedBy: actor,
                note: String(payload.note || '').trim(),
                createdAt: this.nowIso(),
            });
        }
        return this.getBootstrap(actor);
    }

    async addGroupImage(
        actorUsername: string,
        groupId: string,
        payload: { imageUrl: string; s3Key: string; caption?: string },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupPermission(actor, groupId, 'post');
        const imageUrl = String(payload.imageUrl || '').trim();
        const s3Key = String(payload.s3Key || '').trim();
        if (!imageUrl || !s3Key) {
            throw new BadRequestException('Image URL and S3 key are required.');
        }
        const now = this.nowIso();
        const imageRecord: GroupImageRecord = {
            id: this.buildId('image'),
            groupId,
            imageUrl,
            s3Key,
            caption: String(payload.caption || '').trim(),
            uploadedBy: actor,
            createdAt: now,
            updatedAt: now,
        };

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `INSERT INTO chat_group_images (id, group_id, image_url, s3_key, caption, uploaded_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
                [imageRecord.id, imageRecord.groupId, imageRecord.imageUrl, imageRecord.s3Key, imageRecord.caption, imageRecord.uploadedBy, imageRecord.createdAt],
            );
            return this.getBootstrap(actor);
        }

        this.images.push(imageRecord);
        return this.getBootstrap(actor);
    }

    async addImageComment(
        actorUsername: string,
        groupId: string,
        imageId: string,
        payload: { body: string; parentCommentId?: string | null },
    ) {
        const actor = this.normalizeUsername(actorUsername);
        await this.assertGroupPermission(actor, groupId, 'comment');
        const body = String(payload.body || '').trim();
        if (!body) {
            throw new BadRequestException('Comment text is required.');
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const imageResult = await pool?.query('SELECT id FROM chat_group_images WHERE id = $1 AND group_id = $2 LIMIT 1', [imageId, groupId]);
            if (!imageResult?.rows[0]) {
                throw new NotFoundException('Group image not found.');
            }
            const commentId = this.buildId('comment');
            const now = this.nowIso();
            await pool?.query(
                `INSERT INTO chat_group_image_comments (id, image_id, group_id, body, commented_by, parent_comment_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
                [commentId, imageId, groupId, body, actor, payload.parentCommentId || null, now],
            );
            return this.getBootstrap(actor);
        }

        const image = this.images.find((entry) => entry.id === imageId && entry.groupId === groupId);
        if (!image) {
            throw new NotFoundException('Group image not found.');
        }
        const now = this.nowIso();
        this.comments.push({
            id: this.buildId('comment'),
            imageId,
            groupId,
            body,
            commentedBy: actor,
            parentCommentId: payload.parentCommentId || null,
            createdAt: now,
            updatedAt: now,
        });
        return this.getBootstrap(actor);
    }

    async getMessagesForChat(chat: ChatTarget, username?: string) {
        const normalizedUsername = username ? this.normalizeUsername(username) : '';
        const chatId = chat.type === 'group'
            ? (chat.id || chat.name || GENERAL_GROUP_ID)
            : this.buildDmId(normalizedUsername, chat.name);

        if (chat.type === 'group' && chatId !== GENERAL_GROUP_ID) {
            await this.assertGroupPermission(normalizedUsername, chatId, 'view');
            await this.applyRetentionPolicy(chatId);
        }
        if (chat.type === 'dm') {
            await this.assertFriendship(normalizedUsername, chat.name);
        }

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            const result = await pool?.query(
                `SELECT payload
                 FROM chat_messages
                 WHERE chat_type = $1 AND COALESCE(chat_id, chat_name) = $2
                 ORDER BY created_at DESC LIMIT 50`,
                [chat.type, chatId],
            );
            return ((result?.rows || []) as ChatMessageRow[]).map((row) => row.payload).reverse();
        }

        return this.messages
            .filter((message) => message.chat?.type === chat.type && (message.chat?.id || message.chat?.name) === chatId)
            .slice(-50);
    }

    async sendMessage(actor: ChatActor, payload: ChatMessagePayload) {
        const senderUsername = this.normalizeUsername(actor.username);
        const chatId = payload.chat.type === 'group'
            ? (payload.chat.id || payload.chat.name || GENERAL_GROUP_ID)
            : this.buildDmId(senderUsername, payload.chat.name);

        if (payload.chat.type === 'group' && chatId !== GENERAL_GROUP_ID) {
            await this.assertGroupPermission(senderUsername, chatId, 'post');
            await this.applyRetentionPolicy(chatId);
        }
        if (payload.chat.type === 'dm') {
            await this.assertFriendship(senderUsername, payload.chat.name);
        }

        const chatMessage = {
            ...payload,
            id: this.buildId('msg'),
            timestamp: payload.timestamp || new Date().toISOString(),
            user: senderUsername,
            userId: actor.userId || null,
            avatar: actor.avatar || null,
            chat: {
                ...payload.chat,
                id: chatId,
            },
        };

        if (this.hasDatabase()) {
            const pool = await this.ensureSchema();
            await pool?.query(
                `INSERT INTO chat_messages (id, chat_type, chat_id, chat_name, chat_label, sender_user_id, sender_name, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
                [
                    chatMessage.id,
                    chatMessage.chat.type,
                    chatId,
                    chatMessage.chat.name,
                    chatMessage.chat.name,
                    chatMessage.userId,
                    senderUsername,
                    JSON.stringify(chatMessage),
                    chatMessage.timestamp,
                ],
            );
            return chatMessage;
        }

        this.messages.push(chatMessage);
        return chatMessage;
    }

    getRoomId(chat: ChatTarget, currentUsername: string) {
        if (chat.type !== 'group') return '';
        return chat.id || chat.name || GENERAL_GROUP_ID;
    }
}