import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Prevent React 18 strict mode unmount crashes from third party extensions or concurrent bugs
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child.parentNode !== this) {
      if (console) console.warn("React 18 removeChild bypass: node is not a child of this node.", child, this);
      return child;
    }
    return originalRemoveChild.call(this, child);
  };
  
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) console.warn("React 18 insertBefore bypass: referenceNode is not a child of this node.", referenceNode, this);
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
