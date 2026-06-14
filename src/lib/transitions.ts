import React from "react";


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
