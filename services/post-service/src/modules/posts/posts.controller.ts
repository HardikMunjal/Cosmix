import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(':userId')
  getPosts(@Param('userId') userId: string) {
    return { posts: this.postsService.listPosts(userId) };
  }

  @Put(':postId/like')
  likePost(@Param('postId') postId: string) {
    const ok = this.postsService.likePost(postId);
    return { ok };
  }

  @Post(':postId/comment')
  addComment(@Param('postId') postId: string, @Body() body: { authorName: string; text: string }) {
    const ok = this.postsService.addComment(postId, body.authorName || 'Anonymous', body.text || '');
    return { ok };
  }
}
