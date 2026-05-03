// Dashboard.tsx  (only the changed parts shown — replace in your existing file)
//
// Change 1: import useOutletContext
import { useOutletContext } from 'react-router-dom';

// Change 2: inside Dashboard(), replace the localStorage check with:
//
//   const { sampleDataset } = useOutletContext<{
//     sampleDataset: { href: string; filename: string; label: string } | null;
//   }>();
//
// Change 3: in JSX, replace the entire sample download button block with:
//
//   {sampleDataset && (
//     <a
//       href={sampleDataset.href}
//       download={sampleDataset.filename}
//       className="sample-download-btn"
//     >
//       <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
//           d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
//       </svg>
//       {sampleDataset.label}
//     </a>
//   )}
//
// Everything else in Dashboard.tsx stays the same.
