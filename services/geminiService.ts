import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';

export interface ATSReport {
  score: number;
  strengths: string;
  suggestions: string;
}

export interface CvDetails {
    name: string;
    address: string;
    phone: string;
    email: string;
    linkedin: string;
}

export interface JobInfo {
    role: string;
    company: string;
    hiringManager: string;
}

export async function extractCvDetails(cvText: string): Promise<CvDetails> {
    const prompt = `
    Analyze the following CV text and extract the candidate's contact information.
    - name: The full name of the candidate.
    - address: The full mailing address.
    - phone: The primary phone number.
    - email: The primary email address.
    - linkedin: The full URL to their LinkedIn profile. If not present, return an empty string.

    Return the data in JSON format.

    --- CV TEXT ---
    ${cvText}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        address: { type: Type.STRING },
                        phone: { type: Type.STRING },
                        email: { type: Type.STRING },
                        linkedin: { type: Type.STRING },
                    },
                    required: ["name", "address", "phone", "email", "linkedin"],
                },
            },
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error extracting CV details:", error);
        throw new Error("Could not automatically extract contact details from the CV. Please ensure it's clearly formatted.");
    }
}

export async function extractJobInfo(jobDescription: string): Promise<JobInfo> {
    const prompt = `
    Analyze the following job description and extract the following information:
    - role: The specific job title or role being advertised (e.g., "Senior Product Manager", "Software Engineer").
    - company: The name of the company that is hiring.
    - hiringManager: The name of the hiring manager or contact person, if mentioned. Look for phrases like "reports to [Name]" or "contact [Name]". If no name is found, return an empty string.

    Return the data in JSON format.

    --- JOB DESCRIPTION ---
    ${jobDescription}
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        role: { type: Type.STRING, description: 'The job title.' },
                        company: { type: Type.STRING, description: 'The company name.' },
                        hiringManager: { type: Type.STRING, description: 'The hiring manager\'s name, or empty string.' },
                    },
                    required: ["role", "company", "hiringManager"],
                },
            },
        });
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error extracting job info:", error);
        throw new Error("Could not automatically extract job details from the description.");
    }
}

export async function generateCoverLetter(
  jobDescription: string, 
  cvText: string, 
  cvDetails: CvDetails, 
  subject: string, 
  hiringManagerName: string
): Promise<string> {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const prompt = `
    You are an expert career coach and professional writer. Your superpower is crafting cover letters that are not just professional, but deeply human and compelling. You write with a voice that is polished, confident, and personable, making hiring managers feel like they're already getting to know a great future colleague.

    Your task is to write a cover letter based on the provided job description, CV, and user details.

    **Formatting and Tone Instructions:**

    1.  **Header:** Start with the candidate's contact information, formatted professionally.
        ${cvDetails.name}
        ${cvDetails.address}
        ${cvDetails.phone} | ${cvDetails.email}
        ${cvDetails.linkedin}
    2.  **Date:** Add today's date after the header: ${today}.
    3.  **Subject Line:** Include a clear and professional subject line: "Subject: ${subject}".
    4.  **Salutation:** 
        ${hiringManagerName ? 
          `The hiring manager's name is likely "${hiringManagerName}". Start the letter with "Dear ${hiringManagerName},".` : 
          'The hiring manager is unknown. Start with a professional, generic salutation like "Dear Hiring Team,".'
        }
    5.  **Human-Centered Tone:**
        *   **Voice:** Write in the first person ("I," "my"). The tone should be enthusiastic, professional, and authentic.
        *   **Language:** Use clear, direct language. Avoid overly formal or robotic phrasing. Use contractions (like "I'm," "I've") where they sound natural.
        *   **Flow:** Ensure smooth transitions and vary sentence structure for a natural rhythm.

    **Core Content Principles:**

    1.  **Connect, Don't Just List:** Weave a narrative that connects the candidate's specific achievements from their CV to the challenges outlined in the job description. Show, don't just tell.
    2.  **Strategic Structure:**
        *   **Opening:** Grab the reader's attention. Mention the specific role (from the subject line) and express genuine excitement for the company.
        *   **Body (2-3 paragraphs):** Dedicate each paragraph to a key requirement. Back up claims with specific examples and quantifiable results from the CV.
        *   **Closing:** End with confidence. Reiterate your enthusiasm and include a clear call to action for an interview.

    **What to Avoid:**

    *   **Regurgitating the CV:** Do not simply re-state CV points.
    *   **Generic Phrases:** Avoid clichés like "I am a hardworking team player."

    Now, use the following information to craft the perfect cover letter. The final output must start with the candidate's name.

    --- JOB DESCRIPTION ---
    ${jobDescription}

    --- CANDIDATE'S CV ---
    ${cvText}

    --- COVER LETTER ---
  `;

  try {
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error generating cover letter:", error);
    throw new Error("Failed to generate cover letter. The AI service may be temporarily unavailable.");
  }
}

export async function analyzeCvWithATS(jobDescription: string, cvText: string): Promise<ATSReport> {
  const prompt = `
    Act as an advanced Applicant Tracking System (ATS). Your task is to analyze the provided CV against the job description and generate a score and a brief analysis.

    The analysis should be concise and actionable.

    - **Score:** Provide a score out of 100, representing how well the CV matches the job description's requirements for skills, experience, and keywords.
    - **Strengths:** Briefly list the top 2-3 strengths of the CV in relation to the job.
    - **Suggestions:** Provide the top 2-3 most critical, actionable suggestions for improving the CV to better match this specific job.

    --- JOB DESCRIPTION ---
    ${jobDescription}

    --- CANDIDATE'S CV ---
    ${cvText}
  `;

  try {
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: 'The ATS score from 0 to 100.' },
              strengths: { type: Type.STRING, description: 'A brief summary of the CV\'s strengths.' },
              suggestions: { type: Type.STRING, description: 'Actionable suggestions for improvement.' },
            },
            required: ["score", "strengths", "suggestions"],
          },
        },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error analyzing CV with ATS:", error);
    throw new Error("Failed to analyze CV. The AI service may be temporarily unavailable.");
  }
}

export async function optimizeCv(jobDescription: string, cvText: string): Promise<string> {
    const prompt = `
    You are an expert resume writer and career coach. Your task is to rewrite and optimize the BODY of the provided CV to perfectly align with the given job description.

    **Instructions:**

    1.  **Mirror the Job Description:** Analyze the job description for key skills, technologies, responsibilities, and qualifications. Restructure and rephrase the CV content to highlight these aspects prominently.
    2.  **Use Keywords:** Integrate relevant keywords from the job description naturally throughout the CV, especially in the summary/profile, experience descriptions, and skills sections.
    3.  **Quantify Achievements:** Where possible, enhance descriptions of accomplishments with quantifiable results (e.g., "Increased sales by 20%," "Managed a budget of $50k," "Reduced processing time by 15%"). If the original CV lacks numbers, use your expertise to suggest realistic-sounding metrics that the candidate could then verify.
    4.  **Action Verbs:** Start bullet points with strong action verbs (e.g., "Led," "Developed," "Engineered," "Managed," "Optimized").
    5.  **Tailor the Summary:** Write a powerful, concise professional summary at the top that directly addresses the core requirements of the role.
    
    **CRITICAL:** The output should start DIRECTLY with the Professional Summary. DO NOT include a header with personal contact information (name, address, email, etc.). The output should be only the body of the optimized CV.

    Do not invent new experience, but rephrase and reframe the existing experience to maximize its impact for this specific job application.

    --- JOB DESCRIPTION ---
    ${jobDescription}

    --- CANDIDATE'S ORIGINAL CV ---
    ${cvText}

    --- OPTIMIZED CV BODY---
  `;

  try {
    const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Error optimizing CV:", error);
    throw new Error("Failed to optimize CV. The AI service may be temporarily unavailable.");
  }
}