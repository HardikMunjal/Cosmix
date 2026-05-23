import { Injectable } from '@nestjs/common';

type PostItem = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  body: string;
  activityType: string;
  createdAt: string;
  likes: number;
  comments: Array<{ id: string; authorName: string; text: string; createdAt: string }>;
  viewedBy: string[];
};

@Injectable()
export class PostsService {
  private posts: PostItem[] = [];

  constructor() {
    const sampleAuthors = ['Hardi', 'Laks', 'Tara', 'Aditi'];
    const sampleActivities = ['run', 'plan', 'recovery', 'strength'];
    const sampleBodies = [
      'Just logged a steady 8.3 km run in 68 min — felt strong and consistent.',
      'Set a new weekly plan with interval sessions and a recovery day baked in.',
      'Completed a focused strength block and topped my energy chart today.',
      'Hit my best pace this month on the evening track run.',
    ];

    for (let i = 0; i < 10; i += 1) {
      const author = sampleAuthors[i % sampleAuthors.length];
      const activity = sampleActivities[i % sampleActivities.length];
      this.posts.push({
        id: `post-${i + 1}`,
        authorId: `user-${i + 1}`,
        authorName: author,
        title: `${author} shared a ${activity} update`,
        body: sampleBodies[i % sampleBodies.length],
        activityType: activity,
        createdAt: new Date(Date.now() - i * 1000 * 60 * 30).toISOString(),
        likes: Math.floor(Math.random() * 16),
        comments: [],
        viewedBy: [],
      });
    }
  }

  listPosts(userId: string): PostItem[] {
    const ranked = this.posts
      .map((post) => ({
        ...post,
        score: this.computeRelevance(post, userId),
      }))
      .sort((left, right) => right.score - left.score || right.createdAt.localeCompare(left.createdAt))
      .map(({ score, ...post }) => post);

    return ranked;
  }

  computeRelevance(post: PostItem, userId: string): number {
    let score = 0;
    score += post.likes * 2;
    score += post.comments.length * 3;
    score += post.activityType === 'run' ? 5 : 2;
    if (post.authorName === 'Hardi') score += 4;
    if (String(post.authorId) === String(userId)) score += 8;
    score += Math.max(0, 100 - ((Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 30))); 
    return score + Math.random() * 10;
  }

  getPost(postId: string): PostItem | undefined {
    return this.posts.find((post) => post.id === postId);
  }

  likePost(postId: string): boolean {
    const post = this.getPost(postId);
    if (!post) return false;
    post.likes += 1;
    return true;
  }

  addComment(postId: string, authorName: string, text: string): boolean {
    const post = this.getPost(postId);
    if (!post) return false;
    post.comments.push({
      id: `comment-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      authorName,
      text,
      createdAt: new Date().toISOString(),
    });
    return true;
  }
}
