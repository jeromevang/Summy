/**
 * Main App Component
 * Root component with routing setup
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';
import { UserList } from './components/UserList';
import { ProductCard } from './components/ProductCard';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app">
          <header className="app-header">
            <h1>Test Application</h1>
          </header>
          
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<LoginForm />} />
              <Route path="/users" element={<UserList />} />
              <Route path="/products" element={<ProductsPage />} />
            </Routes>
          </main>
          
          <footer className="app-footer">
            <p>&copy; 2024 Test App</p>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

const Home: React.FC = () => (
  <div className="home">
    <h2>Welcome</h2>
    <p>This is a test application.</p>
  </div>
);

const ProductsPage: React.FC = () => {
  const products = [
    { id: '1', name: 'Product 1', price: 99.99, description: 'A great product' },
    { id: '2', name: 'Product 2', price: 149.99, description: 'Another great product' },
  ];
  
  return (
    <div className="products-page">
      <h2>Products</h2>
      <div className="product-grid">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

export default App;

