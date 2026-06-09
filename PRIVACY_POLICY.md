# Privacy Policy for Surge API Request Helper

This Privacy Policy describes how the **Surge API Request Helper** Chrome Extension ("Extension") handles user data.

## 1. Data Collection and Usage
The Extension runs entirely locally within your browser. 
- **No Personal Data Collected:** The Extension does not collect, store, track, parse, or transmit any personally identifiable information, browsing history, or user activity.
- **No Third-Party Transmission:** No data is shared, sold, or transferred to third-party servers, advertising networks, or external entities.

## 2. Explanation of Permissions Requested
To perform its core functions, the Extension requests the following permissions:
- **`declarativeNetRequest` / Host Permissions (`<all_urls>`):** These permissions are used strictly to dynamically modify request headers (like `Cookie`, `User-Agent`, `Host`) and add permissive CORS response headers for the API endpoints you test within the companion REST client. Interception rules are short-lived, applied strictly on-device, and cleared immediately after your network requests resolve.

## 3. Changes to This Policy
We may update this Privacy Policy from time to time. Any changes will be posted directly within this repository.

## 4. Contact
If you have any questions or concerns regarding this policy, please open an issue in this repository.
