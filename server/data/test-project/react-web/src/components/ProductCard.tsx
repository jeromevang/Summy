/**
 * Product Card Component
 * Displays a single product in a card layout
 */

import React, { useState } from 'react';

interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: string;
}

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
  onViewDetails?: (productId: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onViewDetails,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      onAddToCart?.(product);
    }
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  return (
    <div 
      className={`product-card ${isHovered ? 'hovered' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="product-image">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} />
        ) : (
          <div className="placeholder-image">No Image</div>
        )}
        
        {product.category && (
          <span className="category-badge">{product.category}</span>
        )}
      </div>
      
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        
        {product.description && (
          <p className="product-description">{product.description}</p>
        )}
        
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
      
      <div className="product-actions">
        <div className="quantity-selector">
          <button 
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
            disabled={quantity <= 1}
          >
            -
          </button>
          <span>{quantity}</span>
          <button onClick={() => setQuantity(q => q + 1)}>+</button>
        </div>
        
        <button 
          className="add-to-cart-btn"
          onClick={handleAddToCart}
        >
          Add to Cart
        </button>
        
        <button 
          className="view-details-btn"
          onClick={() => onViewDetails?.(product.id)}
        >
          Details
        </button>
      </div>
    </div>
  );
};

export default ProductCard;

