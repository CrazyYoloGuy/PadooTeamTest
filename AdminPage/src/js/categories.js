// Categories Management JS
let categories = [];

document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  const search = document.getElementById('categorySearch');
  if (search) search.addEventListener('input', filterCategories);
});

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    categories = data.categories || [];
    renderCategories(categories);
    updateCategoryStats();
  } catch (e) {
    console.error('Failed to load categories', e);
  }
}

function renderCategories(list) {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="no-orders"><div class="empty-state"><i class="fas fa-inbox"></i><p>No categories</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  list.forEach(cat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input class="inline-input" data-id="${cat.id}" data-field="name" value="${escapeHtml(cat.name || '')}" />
      </td>
      <td>
        <input class="inline-input" data-id="${cat.id}" data-field="description" value="${escapeHtml(cat.description || '')}" />
      </td>
      <td>${formatDate(cat.created_at || new Date().toISOString())}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="saveCategory('${cat.id}')"><i class="fas fa-save"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat.id}')"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterCategories(e) {
  const term = (e.target.value || '').toLowerCase();
  const filtered = categories.filter(c => (c.name||'').toLowerCase().includes(term) || (c.description||'').toLowerCase().includes(term));
  renderCategories(filtered);
}

async function createCategory() {
  const name = document.getElementById('newCatName').value.trim();
  const description = document.getElementById('newCatDesc').value.trim();
  if (!name) return notify('Please enter a name', 'warning');
  try {
    const res = await fetch('/api/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Create failed');
    document.getElementById('newCatName').value = '';
    document.getElementById('newCatDesc').value = '';
    notify('Category created', 'success');
    loadCategories();
  } catch (e) { notify('Failed to create category', 'error'); }
}

async function saveCategory(id) {
  const row = document.querySelector(`input[data-id='${id}'][data-field='name']`);
  const rowDesc = document.querySelector(`input[data-id='${id}'][data-field='description']`);
  const name = row ? row.value.trim() : '';
  const description = rowDesc ? rowDesc.value.trim() : '';
  if (!name) return notify('Name is required', 'warning');
  try {
    const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Update failed');
    notify('Category updated', 'success');
    loadCategories();
  } catch (e) { notify('Failed to update category', 'error'); }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  try {
    const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Delete failed');
    notify('Category deleted', 'success');
    loadCategories();
  } catch (e) { notify('Failed to delete category', 'error'); }
}

function updateCategoryStats() {
  const el = document.getElementById('totalCategories');
  if (el) el.textContent = String(categories.length);
}

function formatDate(dateString) {
  const d = new Date(dateString); return d.toLocaleDateString();
}

function escapeHtml(str) {
  return (str||'').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function notify(message, type='info') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = message;
  n.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 16px;border-radius:8px;color:#fff;font-weight:600;z-index:9999;';
  n.style.background = type==='success'?'#22c55e':type==='error'?'#ef4444':type==='warning'?'#f59e0b':'#3b82f6';
  document.body.appendChild(n);
  setTimeout(()=>{ n.remove(); }, 2200);
}
