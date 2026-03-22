import { v4 as uuidv4 } from "uuid";
import type {
  Client, OwnershipData, ManagementData, SkillsData,
  ProcurementData, ESDData, SEDData
} from "./types";

export const DEMO_CLIENT_ID = "demo-client-001";

export const demoClient: Client = {
  id: DEMO_CLIENT_ID,
  name: "Thandanani Transport (Pty) Ltd",
  financialYear: "2025",
  revenue: 120000000,
  npat: 18000000,
  leviableAmount: 58000000,
  industrySector: "Transport & Logistics",
  eapProvince: "Gauteng",
  industryNorm: 4.12,
  financialHistory: [
    { id: uuidv4(), year: "2024", revenue: 108000000, npat: 15600000 },
    { id: uuidv4(), year: "2023", revenue: 95000000, npat: 13200000 },
  ],
};

export const demoOwnership: OwnershipData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  companyValue: 60000000,
  outstandingDebt: 5000000,
  yearsHeld: 8,
  shareholders: [
    {
      id: uuidv4(), name: "Thandanani Family Trust", ownershipType: "shareholder",
      blackOwnership: 1.0, blackWomenOwnership: 0.40, shares: 40, shareValue: 24000000,
      blackNewEntrant: true,
    },
    {
      id: uuidv4(), name: "Sizwe Mkhize", ownershipType: "shareholder",
      blackOwnership: 1.0, blackWomenOwnership: 0, shares: 20, shareValue: 12000000,
    },
    {
      id: uuidv4(), name: "Nomvula Holdings (Pty) Ltd", ownershipType: "shareholder",
      blackOwnership: 1.0, blackWomenOwnership: 1.0, shares: 15, shareValue: 9000000,
    },
    {
      id: uuidv4(), name: "Heinrich van Wyk", ownershipType: "shareholder",
      blackOwnership: 0, blackWomenOwnership: 0, shares: 25, shareValue: 15000000,
    },
  ],
};

export const demoManagement: ManagementData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  employees: [
    { id: uuidv4(), name: "Sizwe Mkhize", gender: "Male", race: "African", designation: "Board", isDisabled: false },
    { id: uuidv4(), name: "Nomvula Dlamini", gender: "Female", race: "African", designation: "Board", isDisabled: false },
    { id: uuidv4(), name: "Raj Govender", gender: "Male", race: "Indian", designation: "Board", isDisabled: false },
    { id: uuidv4(), name: "Heinrich van Wyk", gender: "Male", race: "White", designation: "Board", isDisabled: false },

    { id: uuidv4(), name: "Thabo Mokoena", gender: "Male", race: "African", designation: "Executive Director", isDisabled: false },
    { id: uuidv4(), name: "Lindiwe Khumalo", gender: "Female", race: "African", designation: "Executive Director", isDisabled: false },

    { id: uuidv4(), name: "Bongani Sithole", gender: "Male", race: "African", designation: "Other Executive Management", isDisabled: false },
    { id: uuidv4(), name: "Fatima Adams", gender: "Female", race: "Coloured", designation: "Other Executive Management", isDisabled: false },
    { id: uuidv4(), name: "Pieter Joubert", gender: "Male", race: "White", designation: "Other Executive Management", isDisabled: false },

    { id: uuidv4(), name: "Zanele Mthembu", gender: "Female", race: "African", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "Sipho Ndlovu", gender: "Male", race: "African", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "Ayesha Naidoo", gender: "Female", race: "Indian", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "David Botha", gender: "Male", race: "White", designation: "Senior", isDisabled: false },
    { id: uuidv4(), name: "Craig Williams", gender: "Male", race: "White", designation: "Senior", isDisabled: false },

    { id: uuidv4(), name: "Mpho Tshabalala", gender: "Female", race: "African", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Kagiso Mokone", gender: "Male", race: "African", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Priya Pillay", gender: "Female", race: "Indian", designation: "Middle", isDisabled: false },
    { id: uuidv4(), name: "Johan de Villiers", gender: "Male", race: "White", designation: "Middle", isDisabled: false },

    { id: uuidv4(), name: "Thandi Molefe", gender: "Female", race: "African", designation: "Junior", isDisabled: true },
    { id: uuidv4(), name: "Sbusiso Zulu", gender: "Male", race: "African", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Lerato Mahlangu", gender: "Female", race: "African", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Themba Masango", gender: "Male", race: "African", designation: "Junior", isDisabled: false },
    { id: uuidv4(), name: "Nkosazana Ngcobo", gender: "Female", race: "African", designation: "Junior", isDisabled: false },
  ],
};

export const demoSkills: SkillsData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  leviableAmount: 58000000,
  trainingPrograms: [
    {
      id: uuidv4(), name: "Heavy Vehicle Operator Certification", category: "learnership",
      cost: 280000, employeeId: undefined, isEmployed: true, isBlack: true,
      gender: "Male", race: "African", isDisabled: false,
    },
    {
      id: uuidv4(), name: "Fleet Safety & Compliance Training", category: "short_course",
      cost: 210000, employeeId: undefined, isEmployed: true, isBlack: true,
      gender: "Female", race: "African", isDisabled: false,
    },
    {
      id: uuidv4(), name: "Dangerous Goods Handling", category: "short_course",
      cost: 184000, employeeId: undefined, isEmployed: true, isBlack: true,
      gender: "Male", race: "Coloured", isDisabled: true,
    },
    {
      id: uuidv4(), name: "BCom Supply Chain Bursary", category: "bursary",
      cost: 290000, employeeId: undefined, isEmployed: false, isBlack: true,
      gender: "Female", race: "African", isDisabled: false,
    },
  ],
};

export const demoProcurement: ProcurementData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  tmps: 72000000,
  suppliers: [
    {
      id: uuidv4(), name: "Mkhize Fuel Distributors", beeLevel: 1,
      blackOwnership: 1.0, blackWomenOwnership: 0.30, youthOwnership: 0, disabledOwnership: 0,
      enterpriseType: "generic", spend: 18000000,
      certificateExpiryDate: "2026-09-15",
    },
    {
      id: uuidv4(), name: "Ubuntu Fleet Parts (Pty) Ltd", beeLevel: 1,
      blackOwnership: 0.85, blackWomenOwnership: 0.50, youthOwnership: 0.25, disabledOwnership: 0,
      enterpriseType: "qse", spend: 8500000,
      certificateExpiryDate: "2026-11-30",
    },
    {
      id: uuidv4(), name: "Sizanani Tyre Services", beeLevel: 2,
      blackOwnership: 1.0, blackWomenOwnership: 1.0, youthOwnership: 0, disabledOwnership: 0,
      enterpriseType: "eme", spend: 4200000,
      certificateExpiryDate: "2026-06-30",
    },
    {
      id: uuidv4(), name: "National Diesel Supply Co", beeLevel: 2,
      blackOwnership: 0.60, blackWomenOwnership: 0.20, youthOwnership: 0, disabledOwnership: 0,
      enterpriseType: "generic", spend: 14000000,
      certificateExpiryDate: "2026-12-31",
    },
    {
      id: uuidv4(), name: "Protea Insurance Brokers", beeLevel: 3,
      blackOwnership: 0.51, blackWomenOwnership: 0, youthOwnership: 0, disabledOwnership: 0,
      enterpriseType: "generic", spend: 6500000,
      certificateExpiryDate: "2026-08-15",
    },
    {
      id: uuidv4(), name: "Global Tech Solutions", beeLevel: 4,
      blackOwnership: 0.25, blackWomenOwnership: 0.10, youthOwnership: 0, disabledOwnership: 0,
      enterpriseType: "generic", spend: 9000000,
      certificateExpiryDate: "2025-12-31",
    },
    {
      id: uuidv4(), name: "Kgotla Office Supplies", beeLevel: 1,
      blackOwnership: 1.0, blackWomenOwnership: 0.60, youthOwnership: 0.40, disabledOwnership: 0.10,
      enterpriseType: "eme", spend: 2800000,
      certificateExpiryDate: "2026-10-31",
    },
  ],
};

export const demoESD: ESDData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  contributions: [
    { id: uuidv4(), beneficiary: "Sizanani Tyre Services — Working Capital", type: "grant", amount: 180000, category: "supplier_development" },
    { id: uuidv4(), beneficiary: "Youth Transport Incubator", type: "grant", amount: 90000, category: "enterprise_development" },
  ],
};

export const demoSED: SEDData = {
  id: uuidv4(),
  clientId: DEMO_CLIENT_ID,
  contributions: [
    { id: uuidv4(), beneficiary: "Diepsloot Community School — Transport Safety Programme", type: "grant", amount: 95000, category: "socio_economic" },
    { id: uuidv4(), beneficiary: "Alexandra Skills Centre — Driver Training", type: "grant", amount: 65000, category: "socio_economic" },
    { id: uuidv4(), beneficiary: "Soweto Youth Employment Programme", type: "grant", amount: 45000, category: "socio_economic" },
  ],
};
