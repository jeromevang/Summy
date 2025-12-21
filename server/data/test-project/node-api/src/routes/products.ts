/**
 * Product Routes
 * CRUD operations for product management
 */

import { Router, Request, Response } from 'express';
import { dbService } from '../services/db.service';
import { AuthenticatedRequest, Product } from '../types';

export const productsRouter = Router();

/**
 * GET /api/products
 * List products with filtering and pagination
 */
productsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      minPrice, 
      maxPrice,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];
    
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    
    if (minPrice) {
      params.push(Number(minPrice));
      query += ` AND price >= $${params.length}`;
    }
    
    if (maxPrice) {
      params.push(Number(maxPrice));
      query += ` AND price <= $${params.length}`;
    }
    
    // Add sorting and pagination
    query += ` ORDER BY ${sortBy} ${order}`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    
    const products = await dbService.query<Product>(query, params);
    
    // Get total count
    const countResult = await dbService.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM products'
    );
    
    res.json({
      data: products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult[0]?.count || 0,
      }
    });
  } catch (error: any) {
    console.error('Failed to list products:', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

/**
 * GET /api/products/:id
 * Get product by ID
 */
productsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const products = await dbService.query<Product>(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
    
    if (products.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(products[0]);
  } catch (error: any) {
    console.error('Failed to get product:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

/**
 * POST /api/products
 * Create a new product
 */
productsRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, price, category, stock } = req.body;
    
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const result = await dbService.query<Product>(
      `INSERT INTO products (name, description, price, category, stock, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, price, category, stock || 0, req.user?.id]
    );
    
    res.status(201).json(result[0]);
  } catch (error: any) {
    console.error('Failed to create product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * PUT /api/products/:id
 * Update a product
 */
productsRouter.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, stock } = req.body;
    
    const result = await dbService.query<Product>(
      `UPDATE products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category = COALESCE($4, category),
           stock = COALESCE($5, stock),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, description, price, category, stock, id]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(result[0]);
  } catch (error: any) {
    console.error('Failed to update product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product
 */
productsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await dbService.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Failed to delete product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

