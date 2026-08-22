export function getYearRange(yearType: "fiscal" | "calendar" = "fiscal", referenceDate: Date = new Date()) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)

    if (yearType === "calendar") {
        return {
            from: `${year}-01-01`,
            to: `${year}-12-31`
        };
    }

    // Fiscal Year: April 1 to March 31
    // If we are in Jan-Mar (0, 1, 2), the fiscal year started the previous year
    if (month < 3) {
        return {
            from: `${year - 1}-04-01`,
            to: `${year}-03-31`
        };
    } else {
        return {
            from: `${year}-04-01`,
            to: `${year + 1}-03-31`
        };
    }
}
