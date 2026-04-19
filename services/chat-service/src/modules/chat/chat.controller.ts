import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
    },
  ) {
    return this.chatService.createGroup(body.actorUsername, body);
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

  @Post('groups/:groupId/images')
  addGroupImage(
    @Param('groupId') groupId: string,
    @Body() body: { actorUsername: string; imageUrl: string; s3Key: string; caption?: string },
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