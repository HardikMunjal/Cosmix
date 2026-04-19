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
            return;
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
                const commentsResult = imageIds.length
                    ? await pool?.query('SELECT * FROM chat_group_image_comments WHERE image_id = ANY($1::text[]) ORDER BY created_at ASC', [imageIds])
                    : { rows: [] };
                const commentRows = (commentsResult?.rows || []) as GroupImageCommentRow[];
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
            return this.getBootstrap(actor);
        }

        this.groups.push(groupRecord);
        this.memberships.push(...membershipRecords);
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
        if (!this.memoryMembership(group.id, actor)) {
            this.memberships.push(this.buildMembershipRecord(group.id, actor, 'viewer'));
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