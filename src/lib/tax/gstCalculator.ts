export interface GstSplitResult {
  isInterstate: boolean;
  stateCode: string;
  placeOfSupply: string;
  taxableSubtotal: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
}

export interface ItemGstBreakdown {
  variantId: number;
  productName: string;
  hsnCode?: string;
  qty: number;
  rate: number;
  taxableValue: number;
  taxRatePercent: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  lineTotal: number;
}

export const INDIAN_STATE_GST_CODES: Record<string, string> = {
  "JAMMU AND KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  "PUNJAB": "03",
  "CHANDIGARH": "04",
  "UTTARAKHAND": "05",
  "HARYANA": "06",
  "DELHI": "07",
  "RAJASTHAN": "08",
  "UTTAR PRADESH": "09",
  "BIHAR": "10",
  "SIKKIM": "11",
  "ARUNACHAL PRADESH": "12",
  "NAGALAND": "13",
  "MANIPUR": "14",
  "MIZORAM": "15",
  "TRIPURA": "16",
  "MEGHALAYA": "17",
  "ASSAM": "18",
  "WEST BENGAL": "19",
  "JHARKHAND": "20",
  "ODISHA": "21",
  "CHHATTISGARH": "22",
  "MADHYA PRADESH": "23",
  "GUJARAT": "24",
  "DAMAN AND DIU": "25",
  "DADRA AND NAGAR HAVELI": "26",
  "MAHARASHTRA": "27",
  "ANDHRA PRADESH": "28",
  "KARNATAKA": "29",
  "GOA": "30",
  "LAKSHADWEEP": "31",
  "KERALA": "32",
  "TAMIL NADU": "33",
  "PUDUCHERRY": "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  "TELANGANA": "36",
  "ANDHRA PRADESH (NEW)": "37",
  "LADAKH": "38",
};

export function getStateGstCode(stateName?: string | null): string {
  if (!stateName) return "33"; // Default Tamil Nadu
  const normalized = stateName.trim().toUpperCase();
  return INDIAN_STATE_GST_CODES[normalized] || "33";
}

export function calculateGstSplit(
  sellerState: string,
  buyerState: string,
  taxableAmount: number,
  taxPercent: number = 5
): GstSplitResult {
  const sellerCode = getStateGstCode(sellerState);
  const buyerCode = getStateGstCode(buyerState);
  const isInterstate = sellerCode !== buyerCode;

  const totalTax = Number(((taxableAmount * taxPercent) / 100).toFixed(2));
  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (isInterstate) {
    igstRate = taxPercent;
    igstAmount = totalTax;
  } else {
    cgstRate = Number((taxPercent / 2).toFixed(2));
    sgstRate = Number((taxPercent / 2).toFixed(2));
    cgstAmount = Number((totalTax / 2).toFixed(2));
    sgstAmount = Number((totalTax - cgstAmount).toFixed(2));
  }

  const totalAmount = Number((taxableAmount + totalTax).toFixed(2));

  return {
    isInterstate,
    stateCode: buyerCode,
    placeOfSupply: buyerState || "Tamil Nadu",
    taxableSubtotal: taxableAmount,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    totalAmount,
  };
}

export function numberToWordsIndian(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const n = Math.floor(Math.abs(num));
  if (n === 0) return "Zero Rupees Only";

  const numStr = ("000000000" + n).substr(-9);
  const crore = parseInt(numStr.substr(0, 2), 10);
  const lakh = parseInt(numStr.substr(2, 2), 10);
  const thousand = parseInt(numStr.substr(4, 2), 10);
  const hundred = parseInt(numStr.substr(6, 1), 10);
  const tens = parseInt(numStr.substr(7, 2), 10);

  let str = "";
  if (crore > 0) str += (crore < 20 ? a[crore] : b[Math.floor(crore / 10)] + " " + a[crore % 10]) + "Crore ";
  if (lakh > 0) str += (lakh < 20 ? a[lakh] : b[Math.floor(lakh / 10)] + " " + a[lakh % 10]) + "Lakh ";
  if (thousand > 0) str += (thousand < 20 ? a[thousand] : b[Math.floor(thousand / 10)] + " " + a[thousand % 10]) + "Thousand ";
  if (hundred > 0) str += a[hundred] + "Hundred ";
  if (tens > 0) {
    if (str !== "") str += "and ";
    str += tens < 20 ? a[tens] : b[Math.floor(tens / 10)] + " " + a[tens % 10];
  }

  const paise = Math.round((Math.abs(num) - n) * 100);
  let paiseStr = "";
  if (paise > 0) {
    paiseStr = " and " + (paise < 20 ? a[paise] : b[Math.floor(paise / 10)] + " " + a[paise % 10]) + "Paise";
  }

  return (str.trim() + " Rupees" + paiseStr + " Only").trim();
}

