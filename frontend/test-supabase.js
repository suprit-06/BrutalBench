const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log("Fetching all users in the users table...");
    const { data, error } = await supabase.from('users').select('*');
    
    if (error) {
        console.error("SUPABASE SELECT ERROR:", error);
    } else {
        console.log("USERS:", data);
        
        if (data && data.length > 0) {
            console.log("\nAttempting to insert evaluation for user:", data[0].id);
            const { error: insertError } = await supabase.from('evaluations').insert({
                user_id: data[0].id,
                score: 40,
                critique: "Direct test from backend"
            });
            if (insertError) {
                console.error("INSERT FAILED:", insertError);
            } else {
                console.log("INSERT SUCCEEDED for user", data[0].id);
            }
        }
    }
}

testQuery();
