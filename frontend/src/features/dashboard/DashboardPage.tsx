import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackagePlus, LayoutDashboard } from 'lucide-react';
import styles from './Dashboard.module.css';
import axios from 'axios';
import { useAuth } from '../auth/AuthContext';
import { fetchCategories } from '@/core/api/catalogApi';
import { CatalogCategory } from '@/core/types/catalog';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    subtitle: '',
    shortDescription: '',
    description: '',
    price: 0,
    categorySlug: 'productivity',
    categoryName: 'Productivity',
    heroBadge: 'New Arrival',
    visual: {
      gradientFrom: '#3b82f6',
      gradientTo: '#2dd4bf',
      accent: '#3b82f6',
      glyph: 'package',
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('visual.')) {
      const visualKey = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        visual: { ...prev.visual, [visualKey]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: name === 'price' ? parseFloat(value) : value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post('/catalog/products', formData);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        navigate('/');
      }, 2000);
    } catch (err) {
      console.error(err);
      alert('Failed to add product');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return <div className={styles.dashboardContainer}>Please log in to access the dashboard.</div>;
  }

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Manage your products and store content</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LayoutDashboard size={24} />
          <span>Welcome, {user.name}</span>
        </div>
      </header>

      {success && (
        <div className={styles.successMessage}>
          Product added successfully! Redirecting to home...
        </div>
      )}

      <div className={styles.formCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <PackagePlus size={24} color="#3b82f6" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add New Product</h2>
        </div>

        <form className={styles.productForm} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label>Product Name</label>
            <input name="name" type="text" placeholder="e.g. Ultra Monitor" required onChange={handleChange} />
          </div>

          <div className={styles.inputGroup}>
            <label>Subtitle</label>
            <input name="subtitle" type="text" placeholder="e.g. 4K HDR Resolution" required onChange={handleChange} />
          </div>

          <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
            <label>Short Description</label>
            <input name="shortDescription" type="text" placeholder="One sentence summary" required onChange={handleChange} />
          </div>

          <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
            <label>Full Description</label>
            <textarea name="description" placeholder="Detailed product specifications..." required onChange={handleChange}></textarea>
          </div>

          <div className={styles.inputGroup}>
            <label>Price (USD)</label>
            <input name="price" type="number" step="0.01" placeholder="99.99" required onChange={handleChange} />
          </div>

          <div className={styles.inputGroup}>
            <label>Category</label>
            <select name="categorySlug" onChange={(e) => {
              const slug = e.target.value;
              const name = e.target.options[e.target.selectedIndex].text;
              setFormData(prev => ({ ...prev, categorySlug: slug, categoryName: name }));
            }}>
              {categories.map(cat => (
                <option key={cat.id} value={cat.slug}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.visualGrid}>
            <div className={styles.visualTitle}>Visual Styling</div>
            <div className={styles.inputGroup}>
              <label>Gradient From</label>
              <input name="visual.gradientFrom" type="color" defaultValue="#3b82f6" onChange={handleChange} />
            </div>
            <div className={styles.inputGroup}>
              <label>Gradient To</label>
              <input name="visual.gradientTo" type="color" defaultValue="#2dd4bf" onChange={handleChange} />
            </div>
            <div className={styles.inputGroup}>
              <label>Accent Color</label>
              <input name="visual.accent" type="color" defaultValue="#3b82f6" onChange={handleChange} />
            </div>
            <div className={styles.inputGroup}>
              <label>Icon Glyph</label>
              <input name="visual.glyph" type="text" placeholder="e.g. monitor, cpu" onChange={handleChange} />
            </div>
          </div>

          <button type="submit" className={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Adding Product...' : 'Create Product'}
          </button>
        </form>
      </div>
    </div>
  );
};
