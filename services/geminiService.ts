
import { GoogleGenAI, Type } from "@google/genai";
import { Shift, Staff } from "../types";

// Note: In compliance with Google GenAI SDK guidelines, GoogleGenAI is instantiated 
// inside functions right before API calls to ensure the most up-to-date API key is used.

export const getScheduleInsights = async (
  truthTable: any[], 
  staff: Staff[], 
  startDate: Date, 
  scope: 'hebdomadaire' | 'mensuel' = 'hebdomadaire'
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const targetMonth = startDate.toLocaleDateString('fr-FR', { month: 'long' });
    const targetYear = startDate.getFullYear();
    const periodLabel = `${targetMonth} ${targetYear}`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        You are a French Payroll Expert (Expert en Gestion de Paie). 
        Format a professional "Synthèse de Paie" for ${periodLabel}.
        
        CRITICAL INSTRUCTION:
        The data below is already calculated by a high-precision system. 
        DO NOT PERFORM ANY MATH. DO NOT ADD OR SUBTRACT NUMBERS.
        EXACTLY USE the "monthlyTotal", "monthlyObjective", and weekly totals provided.
        
        DATA SOURCE (THE TRUTH):
        ${JSON.stringify(truthTable)}
        
        REPORT RULES:
        1. List each employee found in the Data Source.
        2. HEADER: "#### [NOM DE L'EMPLOYÉ]"
        3. BREAKDOWN: List each week showing: " - **Semaine [Label]** : [total]h"
        4. DAILY DETAIL: List days: "   * [date] : [hours]h ([type])"
           Note: If hours are 0, it means it was an Absence (Absence/Remplacé).
        5. MONTHLY FINAL: " - **TOTAL EFFECTIF : [monthlyTotal]h** (Objectif contractuel mensuel : [monthlyObjective]h)"
        
        CONSTRAINTS:
        - The "TOTAL EFFECTIF" must be exactly equal to the sum of the weekly lines listed.
        - Use professional French payroll terminology.
        - No conversational intro/outro.
      `,
    });

    return response.text || "Désolé, aucune analyse n'a pu être générée.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Désolé, impossible de générer le rapport de paie pour le moment.";
  }
};

export const interrogateData = async (
  question: string,
  shifts: Shift[],
  staff: Staff[],
  periodLabel: string
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `
        You are an intelligent business analyst for a scheduling app.
        Current Period: ${periodLabel}
        
        DATA CONTEXT:
        - Staff Roster: ${JSON.stringify(staff)}
        - Filtered Shifts: ${JSON.stringify(shifts)} (Note: Shifts outside the selected month or that were 'covered' have been pre-processed).
        
        USER QUESTION: "${question}"
        
        TASK:
        Answer the user's question accurately. 
        Use the data provided. Answer in the same language as the question.
        Markdown formatting is required.
      `,
    });

    return response.text || "Je n'ai pas pu trouver de réponse à cette question.";
  } catch (error) {
    console.error("Gemini Interrogation Error:", error);
    return "Désolé, je ne peux pas répondre à cette question pour le moment.";
  }
};

export const generateAutoSchedule = async (
  staff: Staff[],
  constraints: {
    operatingHours: { day: number, start: number, end: number }[],
    avgShiftLength: number,
    instructions: string
  },
  weekLabel: string
): Promise<Shift[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `
        Task: Act as an expert HR Scheduler. Generate a draft weekly schedule for the week of ${weekLabel}.
        
        Input Data:
        - Staff: ${JSON.stringify(staff.map(s => ({ id: s.id, name: s.name, targetHours: s.targetHours })))}
        - Operating Hours (per day index 0-6): ${JSON.stringify(constraints.operatingHours)}
        - Target Shift Length: ${constraints.avgShiftLength} hours
        - Special User Instructions: "${constraints.instructions}"

        Requirements:
        1. Distribute shifts to help each staff member reach their weekly "targetHours" as closely as possible.
        2. Respect the operating hours for each day.
        3. Aim for the "Target Shift Length" but adjust to fit totals.
        4. Output MUST be a valid JSON array of Shift objects.
        5. Shift Interface: { id: string, staffId: string, dayIndex: number, startTime: number, endTime: number }
        6. Do not include coverageBy or notes in the output.
        7. Generate random 9-character alphanumeric strings for IDs.
        8. RETURN ONLY THE JSON ARRAY. NO MARKDOWN, NO EXPLANATION.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              staffId: { type: Type.STRING },
              dayIndex: { type: Type.INTEGER },
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
            },
            required: ["id", "staffId", "dayIndex", "startTime", "endTime"]
          }
        }
      }
    });

    const jsonStr = response.text?.trim() || "[]";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Auto-Schedule Error:", error);
    throw error;
  }
};
