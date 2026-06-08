import React from "react";

/**
 * Wraps heavy state modifications or client-side tab switching in an elegant 
 * loading animation. Defers the state update briefly to give the loader time 
 * to fade in, preventing laggy visual freezes.
 */
export function startLoadingTransition(callback: () => void) {
    if (typeof window === "undefined") {
        callback();
        return;
    }
    
    // Dispatch custom event to trigger the fade-in loading animation
    window.dispatchEvent(new CustomEvent("unrealemo:loading-start"));
    
    // Defer callback execution by 180ms to allow loading overlay to fully animate in
    setTimeout(() => {
        React.startTransition(() => {
            callback();
        });
        
        // Wait for next paint frames to ensure components are rendered, then dismiss loader
        requestAnimationFrame(() => {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent("unrealemo:loading-end"));
            }, 100);
        });
    }, 180);
}

/**
 * Hook to manage local container loading states for heavy state/tab transitions.
 * Yields a boolean loading state and a function to run a state change wrapped 
 * in a timed transition.
 */
export function useLocalTransition() {
    const [isLoading, setIsLoading] = React.useState(false);

    const startLocalTransition = (callback: () => void) => {
        setIsLoading(true);
        // Defer callback execution by 180ms to let the localized spinner fade in
        setTimeout(() => {
            React.startTransition(() => {
                callback();
            });

            // Wait for next paint frames to ensure render is painted before hiding
            requestAnimationFrame(() => {
                setTimeout(() => {
                    setIsLoading(false);
                }, 100);
            });
        }, 180);
    };

    return [isLoading, startLocalTransition] as const;
}
