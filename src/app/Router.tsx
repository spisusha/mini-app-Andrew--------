import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import HomeScreen from '../screens/HomeScreen';
import CatalogScreen from '../screens/CatalogScreen';
import CategoryModelsScreen from '../screens/CategoryModelsScreen';
import FamilyProductsScreen from '../screens/FamilyProductsScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import SkuVariantScreen from '../screens/WatchVariantScreen';
import CartScreen from '../screens/CartScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderResultScreen from '../screens/OrderResultScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AdminScreen from '../screens/AdminScreen';

function Layout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/catalog" element={<CatalogScreen />} />
        <Route path="/catalog/:category" element={<CategoryModelsScreen />} />
        <Route path="/catalog/:category/:familyId" element={<FamilyProductsScreen />} />
        <Route path="/products" element={<ProductListScreen />} />
        <Route path="/product/:id" element={<ProductDetailScreen />} />
        <Route path="/variant/:variantId" element={<SkuVariantScreen />} />
        <Route path="/cart" element={<CartScreen />} />
        <Route path="/checkout" element={<CheckoutScreen />} />
        <Route path="/result" element={<OrderResultScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/admin/*" element={<AdminScreen />} />
      </Routes>
      {!isAdmin && <BottomNav />}
    </>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
