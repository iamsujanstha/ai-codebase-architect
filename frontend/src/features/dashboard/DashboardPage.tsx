import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PackagePlus,
  Shuffle,
  CheckCircle,
  Loader2,
  DollarSign,
  Tag,
  AlignLeft,
  FileText,
  Palette,
  Info,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import styles from './Dashboard.module.css';
import { useAuth } from '../auth/AuthContext';
import { fetchCategories, seedProducts, createProduct } from '@/core/api/catalogApi';
import { CatalogCategory } from '@/core/types/catalog';

type Tab = 'seed' | 'add';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('seed');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);

  // Seed state
  const [isSeedLoading, setIsSeedLoading] = useState(false);
  const [seededCount, setSeededCount] = useState<number | null>(null);

  // Form state
  const [success, setSuccess] = useState(false);
  const [isFormLoading, setIsFormLoading] = useState(false);
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
    },
  });

  useEffect(() => {
    fetchCategories().then(setCategories).catch(console.error);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    if (name.startsWith('visual.')) {
      const visualKey = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        visual: { ...prev.visual, [visualKey]: value },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === 'price' ? parseFloat(value) : value,
      }));
    }
  };

  const handleSeed = async () => {
    setIsSeedLoading(true);
    setSeededCount(null);
    try {
      const result = await seedProducts(4);
      setSeededCount(result.length);
      setTimeout(() => setSeededCount(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Failed to seed products. Make sure the backend is running.');
    } finally {
      setIsSeedLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsFormLoading(true);
    try {
      await createProduct(formData as Record<string, unknown>);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        navigate('/');
      }, 2000);
    } catch (err) {
      console.error(err);
      alert('Failed to add product');
    } finally {
      setIsFormLoading(false);
    }
  };

  if (!user) {
    return (
      <div className={styles.dashboardContainer} style={{ textAlign: 'center', paddingTop: '5rem' }}>
        <Info size={48} color="var(--text-muted)" style={{ marginBottom: '1.5rem' }} />
        <h2 style={{ color: 'var(--text-secondary)' }}>Please log in to access the dashboard.</h2>
      </div>
    );
  }

  return (
    <main className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1>Admin Dashboard</h1>
          <p>Manage your products and store content</p>
        </div>
        <div className="user-profile-nav">
          <LayoutDashboard size={20} />
          <span className="user-name">Welcome, {user.name}</span>
        </div>
      </header>

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'seed' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('seed')}
          type="button"
        >
          <Shuffle size={16} />
          Seed Random Products
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'add' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('add')}
          type="button"
        >
          <PackagePlus size={16} />
          Add Product
        </button>
      </div>

      {/* ── SEED TAB ── */}
      {activeTab === 'seed' && (
        <section className={styles.formCard}>
          <div className={styles.seedPanel}>
            <div className={styles.seedIcon}>
              <Sparkles size={48} strokeWidth={1.5} />
            </div>
            <h2 className={styles.seedTitle}>Generate Random Products</h2>
            <p className={styles.seedSubtitle}>
              Instantly seed your catalog with <strong>4 AI-generated demo products</strong> spread
              across random categories — perfect for testing the storefront and chat AI.
            </p>

            {seededCount !== null && (
              <div className={styles.successMessage}>
                <CheckCircle size={18} />
                &nbsp; {seededCount} products added successfully! Check the Home page.
              </div>
            )}

            <button
              className={styles.seedButton}
              onClick={handleSeed}
              disabled={isSeedLoading}
              type="button"
            >
              {isSeedLoading ? (
                <>
                  <Loader2 size={18} className={styles.spin} />
                  Generating…
                </>
              ) : (
                <>
                  <Shuffle size={18} />
                  Seed 4 Random Products
                </>
              )}
            </button>

            <p className={styles.seedNote}>
              You can also ask the AI chat to create products for you — try:
              <br />
              <em>"Create a product called Quantum SSD with a $299 price"</em>
            </p>
          </div>
        </section>
      )}

      {/* ── ADD PRODUCT TAB ── */}
      {activeTab === 'add' && (
        <section className={styles.formCard}>
          {success && (
            <div className={styles.successMessage}>
              <CheckCircle size={18} />
              &nbsp; Product added! Redirecting to home…
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
            <PackagePlus size={28} color="var(--success)" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>
              Add New Product
            </h2>
          </div>

          <form className={styles.productForm} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label><Tag size={14} style={{ marginRight: '4px' }} /> Product Name</label>
              <input name="name" type="text" placeholder="e.g. Ultra Monitor" required onChange={handleChange} />
            </div>

            <div className={styles.inputGroup}>
              <label><Info size={14} style={{ marginRight: '4px' }} /> Subtitle</label>
              <input name="subtitle" type="text" placeholder="e.g. 4K HDR Resolution" required onChange={handleChange} />
            </div>

            <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
              <label><AlignLeft size={14} style={{ marginRight: '4px' }} /> Short Description</label>
              <input name="shortDescription" type="text" placeholder="One sentence summary" required onChange={handleChange} />
            </div>

            <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
              <label><FileText size={14} style={{ marginRight: '4px' }} /> Full Description</label>
              <textarea name="description" placeholder="Detailed product specifications..." required onChange={handleChange} />
            </div>

            <div className={styles.inputGroup}>
              <label><DollarSign size={14} style={{ marginRight: '4px' }} /> Price (USD)</label>
              <input name="price" type="number" step="0.01" placeholder="99.99" required onChange={handleChange} />
            </div>

            <div className={styles.inputGroup}>
              <label><Tag size={14} style={{ marginRight: '4px' }} /> Category</label>
              <select
                name="categorySlug"
                onChange={(e) => {
                  const slug = e.target.value;
                  const name = e.target.options[e.target.selectedIndex].text;
                  setFormData((prev) => ({ ...prev, categorySlug: slug, categoryName: name }));
                }}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.visualGrid}>
              <div className={styles.visualTitle}>
                <Palette size={18} color="var(--text-muted)" />
                Visual Styling
              </div>
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

            <button type="submit" className={styles.submitButton} disabled={isFormLoading}>
              {isFormLoading ? (
                <><Loader2 size={18} className={styles.spin} /> Processing…</>
              ) : (
                'Create Product'
              )}
            </button>
          </form>
        </section>
      )}
    </main>
  );
};
