import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../utils/Firebase";
import { isOfficial } from "../utils/FirebaseFunctions.jsx";
import { motion } from "framer-motion";

// Assets
import HeroIllustration from "../assets/hero-illustration.svg";
import ReportIcon from "../assets/icons/report.svg";
import TrackIcon from "../assets/icons/track.svg";
import CommunityIcon from "../assets/icons/community.svg";

const FeatureCard = ({ icon, title, description, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    className="bg-white p-6 rounded-xl shadow-sm border border-neutral-100 hover:shadow-md transition-shadow"
  >
    <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mb-4">
      <img src={icon} alt={title} className="w-6 h-6 text-primary-600" />
    </div>
    <h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>
    <p className="text-neutral-600">{description}</p>
  </motion.div>
);

const HomePage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const official = await isOfficial(user.uid);
        navigate(official ? "/official-dashboard" : "/citizen-dashboard");
      } catch (e) {
        console.error("Auth error:", e);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      
      {/* Hero Section */}
      <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 leading-tight mb-6">
              Report Traffic Issues, <span className="text-primary-600">Make Roads Safer</span>
            </h1>
            <p className="text-lg text-neutral-600 mb-8 max-w-lg mx-auto lg:mx-0">
              Join thousands of citizens working together to improve road safety and report traffic violations in your community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                to="/citizen-login"
                className="btn btn-primary px-8 py-3 text-base font-medium"
              >
                Report an Issue
              </Link>
              <Link
                to="/feed"
                className="btn btn-outline px-8 py-3 text-base font-medium"
              >
                View Reports
              </Link>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative z-10">
              <img
                src={HeroIllustration}
                alt="Traffic safety illustration"
                className="w-full h-auto max-w-lg mx-auto"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-primary-100 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
            <div className="absolute -top-6 -right-6 w-32 h-32 bg-secondary-100 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-neutral-900 mb-4">How It Works</h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Our platform makes it easy to report and track traffic issues in your community.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={ReportIcon}
              title="Report Issues"
              description="Quickly report traffic violations, potholes, or other road hazards with just a few taps."
              delay={0.1}
            />
            <FeatureCard
              icon={TrackIcon}
              title="Track Progress"
              description="Monitor the status of your reports and see when action is taken by local authorities."
              delay={0.2}
            />
            <FeatureCard
              icon={CommunityIcon}
              title="Community Impact"
              description="Join a growing community of citizens working together to make roads safer for everyone."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-primary-600 to-primary-800 text-white">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-6">Ready to make a difference?</h2>
          <p className="text-lg mb-8 text-primary-100 max-w-2xl mx-auto">
            Join thousands of citizens already making their communities safer by reporting traffic issues.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/citizen-login"
              className="btn bg-white text-primary-700 hover:bg-neutral-100 px-8 py-3 text-base font-medium"
            >
              Get Started
            </Link>
            <Link
              to="/official-login"
              className="btn border-2 border-white text-white hover:bg-white/10 px-8 py-3 text-base font-medium"
            >
              Official Login
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex justify-center md:justify-start space-x-6">
              <Link to="/about" className="text-neutral-600 hover:text-neutral-900">About</Link>
              <Link to="/privacy" className="text-neutral-600 hover:text-neutral-900">Privacy</Link>
              <Link to="/terms" className="text-neutral-600 hover:text-neutral-900">Terms</Link>
              <Link to="/contact" className="text-neutral-600 hover:text-neutral-900">Contact</Link>
            </div>
            <div className="mt-8 md:mt-0 text-center md:text-right">
              <p className="text-neutral-500 text-sm">
                &copy; {new Date().getFullYear()} CivicReport. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
