import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi } from './api/adminApi';
import { 
  Save, 
  ArrowLeft, 
  Package, 
  DollarSign, 
  Tag, 
  FileText, 
  Settings,
  Star,
  Warehouse
} from 'lucide-react';
import styles from './Admin.module.css';

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    subtitle: '',
    shortDescription: '',
    description: '',
    price: 0,
    compareAtPrice: 0,
    inventoryCount: 0,
    categorySlug: '',
    categoryName: '',
    tags: '',
    keyHighlights: '',
    heroBadge: '',
    featured: false,
    bestSeller: false,
    newArrival: true,
    rating: 5,
    reviewCount: 0,
    visual: {
      gradientFrom: '#3b82f6',
      gradientTo: '#8b5cf6',
      accent: '#3b82f6',
      glyph: 'package',
    },
  });

  useEffect(() => {
    loadCategories();
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadCategories = async () => {
    try {
      const data = await adminApi.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadProduct = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const product = await adminApi.getProductById(id);
      setFormData({
        ...product,
        tags: product.tags?.join(', ') || '',
        keyHighlights: product.keyHighlights?.join(', ') || '',
      });
    } catch (error) {
      console.error('Failed to load product:', error);
      alert('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const productData = {
        ...formData,
        tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        keyHighlights: formData.keyHighlights.split(',').map((h) => h.trim()).filter(Boolean),
      };

      if (id) {
        await adminApi.updateProduct(id, productData);
      } else {
        await adminApi.createProduct(productData);
      }

      navigate('/admin/products');
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (slug: string) => {
    const category = categories.find((c) => c.slug === slug);
    setFormData({
      ...formData,
      categorySlug: slug,
      categoryName: category?.name || '',
    });
  };

  if (loading && id) {
    return (
      <div className={styles.adminContent}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.loadingText}>Loading product...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <button
          onClick={() => navigate('/admin/products')}
          className={`${styles.btn} ${styles.btnSecondary}`}
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={20} />
          Back to Products
        </button>
        <h1 className={styles.pageTitle}>
          {id ? 'Edit Product' : 'Add New Product'}
        </h1>
        <p className={styles.pageSubtitle}>
          {id ? 'Update product information and settings' : 'Create a new product for your store'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.card}>
        <div className={styles.cardHeader}>
          <Package className={styles.cardIcon} />
          <h3 className={styles.cardTitle}>Product Information</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Basic Information */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <FileText className={styles.cardIcon} />
              <h4 className={styles.cardTitle}>Basic Information</h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className={styles.formLabel}>
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={styles.formInput}
                  placeholder="Enter product name"
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Subtitle
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  className={styles.formInput}
                  placeholder="Brief product subtitle"
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Short Description
                </label>
                <textarea
                  rows={3}
                  value={formData.shortDescription}
                  onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                  className={styles.formTextarea}
                  placeholder="Brief description for product cards"
                />
              </div>

              <div>
                <label className={styles.formLabel}>
                  Full Description *
                </label>
                <textarea
                  rows={5}
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={styles.formTextarea}
                  placeholder="Detailed product description"
                />
              </div>
            </div>
          </div>

          {/* Pricing & Inventory */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <DollarSign className={styles.cardIcon} />
              <h4 className={styles.cardTitle}>Pricing & Inventory</h4>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className={styles.formLabel}>
                  Price *
                </label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className={styles.formInput}
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className={styles.formLabel}>
                  Compare At Price
                </label>
                <div style={{ position: 'relative' }}>
                  <DollarSign size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.compareAtPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, compareAtPrice: parseFloat(e.target.value) })
                    }
                    className={styles.formInput}
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className={styles.formLabel}>
                  Inventory Count *
                </label>
                <div style={{ position: 'relative' }}>
                  <Warehouse size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.inventoryCount}
                    onChange={(e) =>
                      setFormData({ ...formData, inventoryCount: parseInt(e.target.value) })
                    }
                    className={styles.formInput}
                    style={{ paddingLeft: '2.5rem' }}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className={styles.formLabel}>
                  Category *
                </label>
                <select
                  required
                  value={formData.categorySlug}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={styles.formSelect}
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className={styles.card} style={{ marginTop: '1.5rem' }}>
          <div className={styles.cardHeader}>
            <Tag className={styles.cardIcon} />
            <h4 className={styles.cardTitle}>Additional Information</h4>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <div>
              <label className={styles.formLabel}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="tech, gadget, premium"
                className={styles.formInput}
              />
            </div>

            <div>
              <label className={styles.formLabel}>
                Hero Badge
              </label>
              <input
                type="text"
                value={formData.heroBadge}
                onChange={(e) => setFormData({ ...formData, heroBadge: e.target.value })}
                placeholder="New Release"
                className={styles.formInput}
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label className={styles.formLabel}>
              Key Highlights (comma-separated)
            </label>
            <input
              type="text"
              value={formData.keyHighlights}
              onChange={(e) => setFormData({ ...formData, keyHighlights: e.target.value })}
              placeholder="Fast shipping, Premium quality, 1-year warranty"
              className={styles.formInput}
            />
          </div>
        </div>

        {/* Product Settings */}
        <div className={styles.card} style={{ marginTop: '1.5rem' }}>
          <div className={styles.cardHeader}>
            <Settings className={styles.cardIcon} />
            <h4 className={styles.cardTitle}>Product Settings</h4>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="featured"
                checked={formData.featured}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                className={styles.checkbox}
              />
              <label htmlFor="featured" className={styles.checkboxLabel}>
                <Star size={16} />
                Featured Product
              </label>
            </div>

            <div className={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="bestSeller"
                checked={formData.bestSeller}
                onChange={(e) => setFormData({ ...formData, bestSeller: e.target.checked })}
                className={styles.checkbox}
              />
              <label htmlFor="bestSeller" className={styles.checkboxLabel}>
                <Package size={16} />
                Best Seller
              </label>
            </div>

            <div className={styles.checkboxGroup}>
              <input
                type="checkbox"
                id="newArrival"
                checked={formData.newArrival}
                onChange={(e) => setFormData({ ...formData, newArrival: e.target.checked })}
                className={styles.checkbox}
              />
              <label htmlFor="newArrival" className={styles.checkboxLabel}>
                <Tag size={16} />
                New Arrival
              </label>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid #f3f4f6' }}>
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            <Save size={20} />
            {loading ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </form>
    </div>
  );
}
