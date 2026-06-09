import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('push/public-key')
  getPushPublicKey() {
    return { publicKey: this.chatService.getWebPushPublicKey() };
  }

  @Post('push/subscribe')
  subscribePush(@Body() body: { actorUsername: string; subscription: any }) {
    return this.chatService.upsertPushSubscription(body.actorUsername, body.subscription);
  }

  @Post('push/unsubscribe')
  unsubscribePush(@Body() body: { actorUsername: string; endpoint: string }) {
    return this.chatService.removePushSubscription(body.actorUsername, body.endpoint);
  }

  @Get('push/preferences')
  getPushPreferences(@Query('username') username: string) {
    return this.chatService.getPushPreferences(username);
  }

  @Put('push/preferences')
  updatePushPreferences(
    @Body()
    body: {
      actorUsername: string;
      muteAll?: boolean;
      mutedGroupIds?: string[];
      mutedUsernames?: string[];
      wellnessReminderEnabled?: boolean;
    },
  ) {
    return this.chatService.updatePushPreferences(body.actorUsername, body);
  }

  @Get('bootstrap')
  getBootstrap(@Query('username') username: string) {
    return this.chatService.getBootstrap(username);
  }

  @Post('friends/request')
  requestFriend(@Body() body: { actorUsername: string; targetUsername: string }) {
    return this.chatService.sendFriendRequest(body.actorUsername, body.targetUsername);
  }

  @Post('friends/accept')
  acceptFriend(@Body() body: { actorUsername: string; requesterUsername: string }) {
    return this.chatService.acceptFriendRequest(body.actorUsername, body.requesterUsername);
  }

  @Post('groups')
  createGroup(
    @Body()
    body: {
      actorUsername: string;
      name: string;
      description?: string;
      parentGroupId?: string | null;
      memberUsernames?: string[];
      viewerUsernames?: string[];
      coverImageUrl?: string | null;
      coverS3Key?: string | null;
      coverMediaType?: 'image' | 'video' | null;
    },
  ) {
    return this.chatService.createGroup(body.actorUsername, body);
  }

  @Put('groups/:groupId/cover')
  updateGroupCover(
    @Param('groupId') groupId: string,
    @Body()
    body: {
      actorUsername: string;
      coverImageUrl: string;
      coverS3Key: string;
      coverMediaType?: 'image' | 'video' | null;
    },
  ) {
    return this.chatService.updateGroupCover(body.actorUsername, groupId, body);
  }

  @Put('groups/:groupId/access')
  updateGroupAccess(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; memberUsernames?: string[]; viewerUsernames?: string[] },
  ) {
    return this.chatService.updateGroupAccess(body.actorUsername, groupId, body);
  }

  @Post('groups/join-link')
  joinGroupByLink(@Body() body: { actorUsername: string; shareToken: string }) {
    return this.chatService.joinGroupByShareToken(body.actorUsername, body.shareToken);
  }

  @Get('groups/public/:shareToken')
  getPublicGroupInfo(@Param('shareToken') shareToken: string) {
    return this.chatService.getGroupPublicByShareToken(shareToken);
  }

  @Put('groups/:groupId/settings')
  updateGroupSettings(
    @Param('groupId') groupId: string,
    @Body()
    body: {
      actorUsername: string;
      allowJoinByLink?: boolean;
      clearMessagesAfterHours?: number | null;
      onlyAdminsCreateFolders?: boolean;
      onlyAdminsBookmarkMessages?: boolean;
    },
  ) {
    return this.chatService.updateGroupSettings(body.actorUsername, groupId, body);
  }

  @Put('groups/:groupId/members/:targetUsername/security')
  updateGroupMemberSecurity(
    @Param('groupId') groupId: string,
    @Param('targetUsername') targetUsername: string,
    @Body()
    body: {
      actorUsername: string;
      role?: 'owner' | 'admin' | 'member' | 'viewer';
      canView?: boolean;
      canPost?: boolean;
      canComment?: boolean;
      canInvite?: boolean;
    },
  ) {
    return this.chatService.updateGroupMemberSecurity(body.actorUsername, groupId, targetUsername, body);
  }

  @Post('groups/:groupId/folders')
  createGroupFolder(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; name: string; description?: string; parentFolderId?: string | null },
  ) {
    return this.chatService.createGroupFolder(body.actorUsername, groupId, body);
  }

  @Put('groups/:groupId/parent')
  moveGroupParent(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; parentGroupId?: string | null },
  ) {
    return this.chatService.moveGroupParent(body.actorUsername, groupId, body);
  }

  @Put('groups/:groupId/folders/:folderId/parent')
  moveFolderParent(
    @Param('groupId') groupId: string,
    @Param('folderId') folderId: string,
    @Body() body: { actorUsername: string; parentFolderId?: string | null },
  ) {
    return this.chatService.moveFolderParent(body.actorUsername, groupId, folderId, body);
  }

  @Post('groups/:groupId/folders/:folderId/items')
  addFolderItem(
    @Param('groupId') groupId: string,
    @Param('folderId') folderId: string,
    @Body() body: { actorUsername: string; messageId?: string | null; imageId?: string | null; note?: string },
  ) {
    return this.chatService.addFolderItem(body.actorUsername, groupId, folderId, body);
  }

  @Post('groups/:groupId/bookmarks')
  addMessageBookmark(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; messageId: string; note?: string },
  ) {
    return this.chatService.addMessageBookmark(body.actorUsername, groupId, body);
  }

  @Post('groups/:groupId/images')
  addGroupImage(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; imageUrl: string; s3Key: string; caption?: string; mediaType?: 'image' | 'video' | null },
  ) {
    return this.chatService.addGroupImage(body.actorUsername, groupId, body);
  }

  @Post('groups/:groupId/images/:imageId/comments')
  addImageComment(
    @Param('groupId') groupId: string,
    @Param('imageId') imageId: string,
    @Body() body: { actorUsername: string; body: string; parentCommentId?: string | null },
  ) {
    return this.chatService.addImageComment(body.actorUsername, groupId, imageId, body);
  }
}