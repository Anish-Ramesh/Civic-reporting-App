import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

// Debug: Check if Leaflet is available
console.log('Leaflet available:', typeof L !== 'undefined' ? 'Yes' : 'No');
if (typeof L !== 'undefined') {
  console.log('Leaflet version:', L.version);
}

// Context Providers
import { AuthProvider } from "./contexts/AuthContext";
import SafeAreaProvider from "./components/SafeAreaProvider";
import { MediaCaptureProvider } from "./contexts/MediaCaptureContext.jsx";

// Pages
import Home from "./pages/Home";
import Register from "./pages/auth/Register";
import CitizenDashboard from "./pages/CitizenDashboard";
import Login from "./pages/auth/Login";
import OfficialDashboard from "./pages/OfficialDashboard";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import OfficialPriority from "./pages/OfficialPriority";
import ReportComplaint from "./pages/ReportComplaint";
import TrackComplaints from "./pages/TrackComplaints";
import Feed from "./pages/Feed";
import Profile from "./pages/Profile";
import Unauthorized from "./pages/Unauthorized";
import ReportedIssues from "./pages/officials/ReportedIssues";
import HostLive from "./pages/HostLive.jsx";
import WatchLive from "./pages/WatchLive.jsx";

// Components
import Layout from "./components/Layout";
import AuthNavbar from "./components/AuthNavbar";
import ProtectedRoute from "./components/ProtectedRoute";

// Helper that returns a React element wrapped in appropriate layout
const withLayout = (Component, options = {}) => {
  const authRoutes = ['/', '/register', '/citizen-login', '/official-login'];
  const isAuthRoute = authRoutes.includes(window.location.pathname);
  
  // Routes that should hide the bottom navigation
  const noBottomNavRoutes = [
    '/feed',
    '/reported-issues',
    '/analytics'
  ];
  
  const shouldShowBottomNav = !noBottomNavRoutes.includes(window.location.pathname);
  
  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AuthNavbar />
        <main>
          <Component />
        </main>
      </div>
    );
  }

  // For all other routes, use the main Layout with configurable bottom navigation
  return (
    <Layout showBottomNav={options.showBottomNav !== undefined ? options.showBottomNav : shouldShowBottomNav}>
      <Component />
    </Layout>
  );
};

const router = createBrowserRouter([
  // Public routes
  { path: "/", element: withLayout(Home) },
  { path: "/register", element: withLayout(Register) },
  { path: "/citizen-login", element: withLayout(Login) },
  { path: "/official-login", element: withLayout(Login) },
  { path: "/unauthorized", element: withLayout(Unauthorized) },
  
  // Protected citizen routes
  { 
    path: "/citizen-dashboard", 
    element: (
      <ProtectedRoute>
        {withLayout(CitizenDashboard)}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/report", 
    element: (
      <ProtectedRoute>
        {withLayout(ReportComplaint)}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/feed", 
    element: (
      <ProtectedRoute>
        {withLayout(Feed)}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/profile", 
    element: (
      <ProtectedRoute allowBoth={true}>
        {withLayout(Profile)}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/track-complaints", 
    element: (
      <ProtectedRoute>
        {withLayout(TrackComplaints)}
      </ProtectedRoute>
    ) 
  },
  
  // Protected official routes
  { 
    path: "/official-dashboard", 
    element: (
      <ProtectedRoute requiredRole="official">
        {withLayout(OfficialDashboard)}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/reported-issues", 
    element: (
      <ProtectedRoute requiredRole="official">
        {withLayout(ReportedIssues, { showBottomNav: false })}
      </ProtectedRoute>
    ) 
  },
  { 
    path: "/official-priority", 
    element: (
      <ProtectedRoute requiredRole="official">
        {withLayout(OfficialPriority, { showBottomNav: false })}
      </ProtectedRoute>
    ) 
  },
  // Live routes
  {
    path: "/live/host",
    element: (
      <ProtectedRoute>
        {withLayout(HostLive, { showBottomNav: false })}
      </ProtectedRoute>
    )
  },
  {
    path: "/live/:sessionId",
    element: (
      // Allow both guests and logged-in viewers to watch
      <ProtectedRoute allowBoth={true}>
        {withLayout(WatchLive, { showBottomNav: false })}
      </ProtectedRoute>
    )
  },
  { 
    path: "/analytics", 
    element: (
      <ProtectedRoute requiredRole="official">
        {withLayout(AnalyticsDashboard, { showBottomNav: false })}
      </ProtectedRoute>
    ) 
  },
  
  // Official-only routes
  { 
    path: "/official/*", 
    element: (
      <ProtectedRoute requireOfficial={true}>
        {withLayout(Unauthorized)}
      </ProtectedRoute>
    ) 
  },
  
  // Catch-all route
  { path: "*", element: <Navigate to="/" replace /> }
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SafeAreaProvider>
        <MediaCaptureProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
          <ToastContainer 
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </MediaCaptureProvider>
      </SafeAreaProvider>
    </AuthProvider>
  </React.StrictMode>
);