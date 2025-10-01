import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import { Edit, Smartphone, LogOut, TrafficCone } from "lucide-react";
import DashboardLinkButton from "../components/DashboardLinkButton";
import ReportedComplaints from "../components/ReportedComplaints";
import SpinnerModal from "../components/SpinnerModal";
// Auth-based routing is handled by ProtectedRoute. Avoid duplicative redirects here.

const CitizenDashboard = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [SpinnerVisible, setSpinnerVisible] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useEffect(() => {
    // ProtectedRoute guarantees only authenticated citizens reach here.
    // Show welcome toast for new users based on query param.
    if (params.get("newUser")) {
      toast.success("Registration Succesful, Welcome to citizen dashboard", {
        icon: "👋",
      });
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
    };
  }, []);
  const handleBeforeInstallPrompt = (event) => {
    event.preventDefault();
    setDeferredPrompt(event);
  };

  const handleInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        setDeferredPrompt(null);
      });
    }
  };
  const handleLogout = () => {
    // Use Firebase auth sign-out via utils if needed, otherwise simple redirect
    try {
      // Optional: import auth sign-out here if required
      // await auth.signOut();
    } catch {}
    navigate("/");
  };

  return (
    <>
      <SpinnerModal visible={SpinnerVisible} />
      <ToastContainer
        position="bottom-center"
        autoClose={5000}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <h2 className=" lg:mt-4 leading-normal font-semibold text-center text-lg lg:text-[1.6rem] my-4 lg:text-left lg:mx-20">
        Dashboard
      </h2>
      <div className="grid lg:grid-cols-[0.8fr_0.6fr] mx-10">
        <div>
          <DashboardLinkButton
            icon={Edit}
            name={"New Complaint"}
            link={"/report"}
          />
          <DashboardLinkButton
            icon={TrafficCone}
            name={"Track Reported complaints"}
            link={"/track-complaints"}
            className={"lg:hidden"}
          />
          <DashboardLinkButton
            icon={Smartphone}
            name={"Install as an app (Mobile)"}
            onClick={handleInstall}
            className={"lg:hidden"}
          />
          <DashboardLinkButton
            icon={LogOut}
            name={"Logout"}
            onClick={handleLogout}
            className={"lg:hidden"}
          />
        </div>
        <div className="hidden lg:flex">
          <ReportedComplaints />
        </div>
      </div>
    </>
  );
};

export default CitizenDashboard;
