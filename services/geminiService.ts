import { GoogleGenAI, Type } from "@google/genai";
import { PuzzleData, Difficulty } from "../types";

// Always use gemini-3-flash-preview for basic text tasks like concept extraction and JSON structuring.
export const generatePuzzle = async (
  text: string, 
  difficulty: Difficulty, 
  specificConcept?: string
): Promise<PuzzleData> => {
  // Use process.env.API_KEY directly as required by the coding guidelines.
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "") {
    console.error("ERREUR CRITIQUE: process.env.API_KEY est indéfini ou vide.");
    throw new Error("Clé API manquante. Veuillez configurer API_KEY dans Vercel.");
  }

  // Initialisation as per guidelines: new GoogleGenAI({ apiKey: ... })
  const ai = new GoogleGenAI({ apiKey });
  
  const difficultyPrompts = {
    'Facile': "Choisis une définition simple et courte. Découpe-la en 3 à 5 segments courts.",
    'Moyen': "Choisis une définition de longueur standard. Découpe-la en 6 à 8 segments logiques.",
    'Difficile': "Choisis une définition longue, riche et complexe. Découpe-la en 9 à 12 segments pour augmenter le défi."
  };

  const modeInstruction = specificConcept 
    ? `Cherche spécifiquement le concept "${specificConcept}" dans le texte fourni. Extrais sa définition EXACTE telle qu'elle apparaît dans le document.`
    : "Identifie un concept clé important de manière autonome dans le texte et extrais sa définition exacte.";

  try {
    const response = await ai.models.generateContent({
      // Using recommended gemini-3-flash-preview for text tasks.
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [{
            text: `Tu es un assistant pédagogique expert. Analyse le texte suivant pour créer un puzzle de mémorisation.
            
            OBJECTIF :
            ${modeInstruction}
            
            CONTRAINTES DE DIFFICULTÉ :
            ${difficultyPrompts[difficulty]}
            
            INSTRUCTIONS SUPPLÉMENTAIRES :
            1. Les segments doivent former la définition complète et exacte une fois remis dans l'ordre original.
            2. Ne pas inventer de texte, rester fidèle au document fourni.
            
            TEXTE DU COURS :
            ${text.substring(0, 20000)}`
          }]
        }
      ],
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
              description: "La définition découpée en segments ordonnés permettant de reconstruire la phrase exacte.",
            },
          },
          required: ["concept", "definition", "segments"],
        },
      },
    });

    // response.text is a property, not a method. Access directly.
    const result = response.text;
    if (!result) throw new Error("L'IA a retourné une réponse vide.");

    const puzzleData: PuzzleData = JSON.parse(result.trim());
    console.log("Puzzle généré avec succès pour :", puzzleData.concept);
    return puzzleData;
  } catch (error: any) {
    console.error("Détails de l'erreur Gemini :", error);
    if (error.message?.includes("API key not valid")) {
      throw new Error("Clé API invalide. Vérifiez vos paramètres Vercel.");
    }
    throw error;
  }
};
