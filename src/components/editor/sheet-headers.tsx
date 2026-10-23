import { createContext, useContext } from 'react';

/** The header row of the template's spreadsheet tab, once loaded in the editor (index 0 = column A). */
export const SheetHeadersContext = createContext<string[] | undefined>(undefined);

export const useSheetHeaders = () => useContext(SheetHeadersContext);
