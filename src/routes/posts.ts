import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { sanitizeString } from '../lib/utils';
import { logger } from '../lib/logger';

const router = Router();

// Create a post
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId; // Use authenticated user ID
    const { content, mentionedTicker } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Sanitize post content
    const sanitizedContent = sanitizeString(content, 1000);
    if (sanitizedContent.length === 0) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    let mentionedCompanyId: number | null = null;

    if (mentionedTicker) {
      const company = await prisma.company.findUnique({
        where: { tickerSymbol: mentionedTicker.toUpperCase() },
      });
      if (company) {
        mentionedCompanyId = company.id;
      }
    }

    const post = await prisma.post.create({
      data: {
        userId,
        content: sanitizedContent,
        mentionedCompanyId,
      },
      include: {
        user: { select: { username: true } },
        mentionedCompany: { select: { tickerSymbol: true } },
      },
    });

    return res.status(201).json({
      postId: post.id,
      username: post.user.username,
      content: post.content,
      mentionedTicker: post.mentionedCompany?.tickerSymbol || null,
      createdAt: post.createdAt,
    });
  } catch (error) {
    logger.error('Error in posts route', error);
    return res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get posts
router.get('/', async (req: Request, res: Response) => {
  try {
    const ticker = req.query.ticker as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    const whereClause = ticker
      ? { mentionedCompany: { tickerSymbol: ticker.toUpperCase() } }
      : {};

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        user: { select: { username: true } },
        mentionedCompany: { select: { tickerSymbol: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const result = posts.map(post => ({
      postId: post.id,
      username: post.user.username,
      content: post.content,
      companyMentioned: post.mentionedCompany?.tickerSymbol || null,
      createdAt: post.createdAt,
      isEdited: post.isEdited,
    }));

    return res.json(result);
  } catch (error) {
    logger.error('Error in posts route', error);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Edit a post
router.put('/:postId', authenticate, async (req: Request<{ postId: string }>, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);
    const userId = req.user!.userId; // Use authenticated user ID
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Sanitize post content
    const sanitizedContent = sanitizeString(content, 1000);
    if (sanitizedContent.length === 0) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        content: sanitizedContent,
        isEdited: true,
        editedAt: new Date(),
      },
    });

    return res.json({
      postId: updatedPost.id,
      content: updatedPost.content,
      isEdited: updatedPost.isEdited,
      editedAt: updatedPost.editedAt,
    });
  } catch (error) {
    logger.error('Error in posts route', error);
    return res.status(500).json({ error: 'Failed to edit post' });
  }
});

// Delete a post
router.delete('/:postId', authenticate, async (req: Request<{ postId: string }>, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);
    const userId = req.user!.userId; // Use authenticated user ID

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await prisma.post.delete({
      where: { id: postId },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Error in posts route', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
