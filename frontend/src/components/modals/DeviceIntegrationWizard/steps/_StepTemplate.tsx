// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE: Wizard Step Component
// ─────────────────────────────────────────────────────────────────────────────
// To create a new wizard step:
//   1. Copy this file to `Step{N}_{Name}.tsx`
//   2. Rename component `StepTemplate` → `Step{N}{Name}`
//   3. Use `useWizard()` hook (defined in WizardContext.tsx) to read/update state
//   4. Call `actions.next()` / `actions.prev()` for navigation
//   5. Add your step to the steps array in `index.tsx`
//
// EXAMPLE STRUCTURE (uncomment and adapt after Task 30):
//
// import { useWizard } from '../WizardContext';
//
// export function StepTemplate() {
//   const { state, actions } = useWizard();
//
//   return (
//     <div className="p-6">
//       <h2 className="text-lg font-semibold mb-4">步驟標題</h2>
//
//       <div className="mb-6">
//         {/* 步驟內容 */}
//       </div>
//
//       <div className="flex justify-between">
//         <button onClick={actions.prev} className="px-4 py-2 border rounded">
//           ← 上一步
//         </button>
//         <button onClick={actions.next} className="px-4 py-2 bg-blue-500 text-white rounded">
//           下一步 →
//         </button>
//       </div>
//     </div>
//   );
// }
// ─────────────────────────────────────────────────────────────────────────────

export {};
