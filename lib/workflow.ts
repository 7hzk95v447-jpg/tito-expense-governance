export type RequestStatus =
  | "DRAFT"
  | "PENDING_DEPARTMENT"
  | "RETURNED_TO_CREATOR"
  | "PENDING_ACCOUNTING"
  | "RETURNED_ACCOUNTING_TO_DEPARTMENT"
  | "PENDING_EXECUTIVE"
  | "READY_FOR_BATCH"
  | "IN_BATCH_DRAFT"
  | "PENDING_BATCH_APPROVAL"
  | "READY_FOR_EXECUTION"
  | "EXECUTION_PENDING"
  | "EXECUTED"
  | "EXECUTION_FAILED"
  | "REJECTED_FINAL"
  | "CANCELLED";

export type WorkflowAction =
  | "SUBMIT"
  | "APPROVE"
  | "RETURN"
  | "REJECT"
  | "RESUBMIT"
  | "REAPPROVE"
  | "CANCEL";

export type Transition = {
  to: RequestStatus;
  stage: string;
  taskType: string | null;
  assignedRole: string | null;
  assignedDepartmentCode?: string;
  reasonRequired: boolean;
};

const transitions: Record<string, Partial<Record<WorkflowAction, Transition>>> = {
  DRAFT: {
    SUBMIT: { to: "PENDING_DEPARTMENT", stage: "DEPARTMENT", taskType: "DEPARTMENT_APPROVAL", assignedRole: "DEPARTMENT_MANAGER", reasonRequired: false },
    CANCEL: { to: "CANCELLED", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: false },
  },
  PENDING_DEPARTMENT: {
    APPROVE: { to: "PENDING_ACCOUNTING", stage: "ACCOUNTING", taskType: "ACCOUNTING_REVIEW", assignedRole: "ACCOUNTING_REVIEWER", assignedDepartmentCode: "FINANCE", reasonRequired: false },
    RETURN: { to: "RETURNED_TO_CREATOR", stage: "CREATOR", taskType: "REQUEST_CORRECTION", assignedRole: "REQUESTER", reasonRequired: true },
    REJECT: { to: "REJECTED_FINAL", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
    CANCEL: { to: "CANCELLED", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
  },
  RETURNED_TO_CREATOR: {
    RESUBMIT: { to: "PENDING_DEPARTMENT", stage: "DEPARTMENT", taskType: "DEPARTMENT_APPROVAL", assignedRole: "DEPARTMENT_MANAGER", reasonRequired: false },
    CANCEL: { to: "CANCELLED", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
  },
  PENDING_ACCOUNTING: {
    APPROVE: { to: "PENDING_EXECUTIVE", stage: "EXECUTIVE", taskType: "EXECUTIVE_APPROVAL", assignedRole: "EXECUTIVE", assignedDepartmentCode: "EXECUTIVE", reasonRequired: false },
    RETURN: { to: "RETURNED_ACCOUNTING_TO_DEPARTMENT", stage: "DEPARTMENT", taskType: "DEPARTMENT_RESPONSE", assignedRole: "DEPARTMENT_MANAGER", reasonRequired: true },
    REJECT: { to: "REJECTED_FINAL", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
  },
  RETURNED_ACCOUNTING_TO_DEPARTMENT: {
    REAPPROVE: { to: "PENDING_ACCOUNTING", stage: "ACCOUNTING", taskType: "ACCOUNTING_REVIEW", assignedRole: "ACCOUNTING_REVIEWER", assignedDepartmentCode: "FINANCE", reasonRequired: false },
    RETURN: { to: "RETURNED_TO_CREATOR", stage: "CREATOR", taskType: "REQUEST_CORRECTION", assignedRole: "REQUESTER", reasonRequired: true },
    REJECT: { to: "REJECTED_FINAL", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
  },
  PENDING_EXECUTIVE: {
    APPROVE: { to: "READY_FOR_BATCH", stage: "BATCH_PREPARATION", taskType: "ADD_TO_PAYMENT_RUN", assignedRole: "BATCH_PREPARER", assignedDepartmentCode: "FINANCE", reasonRequired: false },
    RETURN: { to: "PENDING_ACCOUNTING", stage: "ACCOUNTING", taskType: "ACCOUNTING_REVIEW", assignedRole: "ACCOUNTING_REVIEWER", assignedDepartmentCode: "FINANCE", reasonRequired: true },
    REJECT: { to: "REJECTED_FINAL", stage: "CLOSED", taskType: null, assignedRole: null, reasonRequired: true },
  },
};

export function getTransition(status: string, action: string): Transition | null {
  return transitions[status]?.[action as WorkflowAction] ?? null;
}

export function isDecisionAction(action: string) {
  return ["APPROVE", "RETURN", "REJECT", "REAPPROVE"].includes(action);
}

export function settlementGroupFor(categoryCode: string) {
  const groups: Record<string, string> = {
    supplier: "SUPPLIERS",
    employee: "EMPLOYEES",
    government: "GOVERNMENT",
    operations: "MAINTENANCE_OPERATIONS",
    marketing: "MARKETING",
    it: "TECHNOLOGY",
    recurring: "MONTHLY_OBLIGATIONS",
    other: "OTHER",
  };
  return groups[categoryCode] ?? "OTHER";
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
