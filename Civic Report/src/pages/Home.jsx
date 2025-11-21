import { Link } from 'react-router-dom';
import { MapPin, AlertTriangle, Users, Shield } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Welcome to <span className="text-emerald-600">Civic Mitra</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-10">
            Your one-stop solution for reporting and resolving local civic issues. 
            Connect with your community and local authorities to make your neighborhood better.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-20">
            <Link 
              to="/register" 
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 md:py-4 md:text-lg md:px-10 transition-colors"
            >
              Get Started
            </Link>
            <Link 
              to="/about" 
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-emerald-700 bg-emerald-100 hover:bg-emerald-200 md:py-4 md:text-lg md:px-10 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              icon: <MapPin className="w-10 h-10 text-emerald-600" />,
              title: "Report Issues",
              description: "Easily report problems in your area with photos and precise location tagging."
            },
            {
              icon: <AlertTriangle className="w-10 h-10 text-emerald-600" />,
              title: "Track Progress",
              description: "Get real-time updates on the status of your reported issues."
            },
            {
              icon: <Users className="w-10 h-10 text-emerald-600" />,
              title: "Community Driven",
              description: "See what issues others in your community are reporting and support them."
            },
            {
              icon: <Shield className="w-10 h-10 text-emerald-600" />,
              title: "Official Support",
              description: "Direct line to local authorities for quick resolution of civic issues."
            }
          ].map((feature, index) => (
            <div key={index} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { number: '1', title: 'Sign Up', description: 'Create an account as a citizen or official.' },
              { number: '2', title: 'Report or View', description: 'Report new issues or view existing ones in your area.' },
              { number: '3', title: 'Get Updates', description: 'Track the progress of reported issues in real-time.' }
            ].map((step, index) => (
              <div key={index} className="relative bg-white p-6 rounded-lg shadow-sm">
                <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-emerald-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to make a difference?</h2>
          <p className="text-xl mb-8 max-w-3xl mx-auto">
            Join thousands of citizens and officials working together to improve our communities.
          </p>
          <Link 
            to="/register" 
            className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-emerald-600 bg-white hover:bg-gray-100 md:py-4 md:text-lg md:px-10 transition-colors"
          >
            Sign Up Now
          </Link>
        </div>
      </section>
    </div>
  );
}
