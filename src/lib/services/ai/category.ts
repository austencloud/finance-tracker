// src/lib/services/ai/category.ts
import type { Transaction, Category } from '$lib/types';
import { categories } from '$lib/stores/transactionStore';
import { getCategorySuggestionPrompt } from './prompts';
// In src/lib/services/ai/category.ts
import { deepseekChat } from './deepseek-client';

export async function suggestCategory(transaction: Transaction): Promise<Category> {
  try {
    const prompt = getCategorySuggestionPrompt(transaction, categories);
    
    const messages = [{ role: 'user', content: prompt }];
    const response = await deepseekChat(messages);
    
    const suggestedCategory = response.trim();
    
    if (categories.includes(suggestedCategory as Category)) {
      return suggestedCategory as Category;
    } else {
      return transaction.category;
    }
  } catch (error) {
    console.error('Error suggesting category:', error);
    return transaction.category;
  }
}