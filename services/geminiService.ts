
import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData, Difficulty } from "../types";

export const generatePuzzle = async (
  text: string, 
  difficulty: Difficulty, 
  specificConcept?: string
): Promise<PuzzleData> => {
  // On utilise import.meta.env pour Vite et on ajoute le préfixe VITE_
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  
  const difficultyPrompts = {
    'Facile': "Choisis une définition simple et courte. Découpe-la en 3 à 5 segments courts.",
    'Moyen': "Choisis une définition de longueur standard. Découpe-la en 6 à 8 segments logiques.",
    'Difficile': "Choisis une définition longue, riche et complexe. Découpe-la en 9 à 12 segments pour augmenter le défi."
  };

  const modeInstruction = specificConcept 
    ? `Cherche spécifiquement le concept "${specificConcept}" dans le texte. Extrais sa définition EXACTE telle qu'elle apparaît dans le document.`
    : "Identifie un concept clé important de manière autonome et extrais sa définition exacte.";

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Tu es un expert en pédagogie. Analyse le texte suivant.
    ${modeInstruction}
    
    RÈGLES :
    1. ${difficultyPrompts[difficulty]}
    2. Les segments doivent être cohérents une fois assemblés.
    3. Si le concept demandé n'est pas trouvé, choisis le concept le plus proche ou un concept très important du texte.
    
    TEXTE :
    ${text.substring(0, 10000)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          concept: {
            type: Type.STRING,
            description: "Le nom du concept extrait.",
          },
          definition: {
            type: Type.STRING,
            description: "La définition complète du concept.",
          },
          segments: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "La définition découpée en segments ordonnés.",
          },
        },
        required: ["concept", "definition", "segments"],
      },
    },
  });

  const puzzleData: PuzzleData = JSON.parse(response.text?.trim() || "{}");
  return puzzleData;
};
