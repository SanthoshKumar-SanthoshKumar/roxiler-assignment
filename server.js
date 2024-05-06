const express = require('express')
const app = express()
const cors = require('cors')
const axios = require("axios");

const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const dbPath = path.join(__dirname, 'transactions.db')


// Connect to SQLite database (create if not exists)
let db = new sqlite3.Database('transactions.db');
// app.use(express.json())

app.use(cors())

// initiaize Database and Server 
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3001, () => {
      console.log('server Running At http://localhost:3001')
    })
  } catch (error) {
    console.log(`DB Error:${error.message}`)
    process.exit(1)
  }
}

// Create tasks table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      price float,
      description TEXT,
      category TEXT,
      image TEXT, 
      sold BOOLEAN, 
      dateOfSale DATE
    )
  `);

  console.log("Table 'tasks' created successfully.");

  // Close database connection
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
  });
});



const fetchAndInsert = async () => {
  const response = await axios.get(
    "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
  );
  const data = response.data;

  for (let item of data) {
    const queryData = `SELECT id FROM tasks WHERE id = ${item.id}`;
    const existingData = await db.get(queryData);
    if (existingData === undefined) {
      const query = `
   INSERT INTO tasks (id, title, price, description, category, image, sold, dateOfSale) 
   VALUES (
       ${item.id},
       '${item.title.replace(/'/g, "''")}',
       ${item.price},
       '${item.description.replace(/'/g, "''")}',
       '${item.category.replace(/'/g, "''")}',
       '${item.image.replace(/'/g, "''")}',
       ${item.sold},
       '${item.dateOfSale.replace(/'/g, "''")}'
   );
`; /*The .replace(/'/g, "''") in the SQL query helps prevent SQL injection attacks by escaping single quotes.*/

      await db.run(query);
    }
  }
  console.log("Transactions added");
};

fetchAndInsert();
initializeDbAndServer()

//API End Point for transactions

app.get('/transactions', async (req,res)=>{ 
  const defaultMounth = '03' ;
  let month = req.query.month || defaultMounth ;
  const searchText = req.query.search || "" ;
  const page = parseInt(req.query.page); 
  const perPage = parseInt(req.query.perPage)

  // calculate offset perpage 
  const offset = (page-1)*perPage 

  let query = ` SELECT * FROM tasks WHERE strftime("%m",dateOfSale)=?` 

  const params=[month]
  
  if(searchText){
   query+= `AND (title LIKE '%${searchText}%' OR description LIKE '%${searchText}% OR price LIKE '%${searchText}%')`
  }
 
  query+= `LIMIT ${perPage} OFFSET ${offset}`

  db.all(query, params, (err, rows) => {
   if (err) {
       console.error('Error fetching transactions:', err);
       res.status(500).json({ error: 'Internal server error' });
   } else {
       res.json(rows);
   }
});

})



// API endpoint for statistics
app.get('/statistics', (req, res) => {
  const month = req.query.month;

  // Query to calculate statistics
  const query = `
      SELECT 
          SUM(CASE WHEN sold = 1 THEN price ELSE 0 END) AS totalSaleAmount,
          COUNT(CASE WHEN sold = 1 THEN 1 END) AS totalSoldItems,
          COUNT(CASE WHEN sold = 0 THEN 1 END) AS totalNotSoldItems
      FROM tasks
      WHERE strftime('%m', dateOfSale) = ?;
  `;

  db.get(query, [month], (err, row) => {
      if (err) {
          console.error('Error fetching statistics:', err);
          res.status(500).json({ error: 'Internal server error' });
      } else {
          res.json({
            totalSaleAmount:row.totalSaleAmount || 0 ,
            totalSoldItems: row.totalSoldItem || 0 ,
            totalNotSoldItems:row.totalNotSoldItems || 0
          });
      }
  });
});

// Define route for bar-chart API 

app.get('/bar-chart' ,(req,res)=>{
  const month = req.query.month 

  const sqlQuery = 
     [
      {range:'0-100', query: `SELECT * FROM tasks WHERE price>=0 AND price<=100 AND strftime('%m' ,dataOfSale) `},
      {range:'101-200', query: `SELECT * FROM tasks WHERE price>=101 AND price<=200 AND strftime('%m' ,dataOfSale) `},
      {range:'201-300', query: `SELECT * FROM tasks WHERE price>=201 AND price<=300 AND strftime('%m' ,dataOfSale) `},
      {range:'301-400', query: `SELECT * FROM tasks WHERE price>=301 AND price<=400 AND strftime('%m' ,dataOfSale) `},
      {range:'401-500', query: `SELECT * FROM tasks WHERE price>=401 AND price<=500 AND strftime('%m' ,dataOfSale) `},
      {range:'501-600', query: `SELECT * FROM tasks WHERE price>=401 AND price<=500 AND strftime('%m' ,dataOfSale) `},
      {range:'601-700', query: `SELECT * FROM tasks WHERE price>=401 AND price<=500 AND strftime('%m' ,dataOfSale) `},
      {range:'701-800', query: `SELECT * FROM tasks WHERE price>=401 AND price<=500 AND strftime('%m' ,dataOfSale) `},
      {range:'801-900', query: `SELECT * FROM tasks WHERE price>=401 AND price<=500 AND strftime('%m' ,dataOfSale) `},
      {range:'901-above', query: `SELECT * FROM tasks WHERE price>=401 AND strftime('%m' ,dataOfSale) `},
     ]

     const promise = sqlQuery.map(({range,query})=>{
      return new promise ((resolve,reject)=>{
        db.get(query,[month],(err,row)=>{
          if (err){
            reject(err)
          }else{
            resolve({range,count:row.count})
          }
        })
      })
     })

     Promise.all(promise)
     .then(results=>{
      res.json(results)
     })
     .catch(err=>{
        console.error('Error executing SqlQueri:', err)
        res.status(500).json({ error: 'Internal server error' })
     })
  
})


// Define routes for pie-chart API 

app.get('/pie-chart',(req,res)=>{

  const month = req.query.month  

  const sqlQuery = `
     SELECT category,COUNT(*) AS itemCount FROM  tasks WHERE strftime('%m', dateOfSale) = ? GROUP BY category ORDER BY category
  `
  db.all(sqlQuery,[month],(err,row)=>{
    if(err){
      console.log('Error Executing queery:',err)
      res.status(500).json({error:'Internal server error'})
    }
    else{
      res.json(row)
    }
  })
});

const baseUrl = 'http://localhost:3001' ;

// function to combine Data from all API 

async function fetchDataFromAllAPIS(endpoints){
  try{
    const responses = await Promise.all(endpoints.map(endPoint=>axios.get(baseUrl+endPoint)))
    const combinedData = responses.map(response=>response.data)
    return combinedData
  }catch(error){
      console.error('Error fetching data from APIS',error)
      throw error
  }
}

// API endpoints to get data from combined Data from all APIS 

app.get('/combined-data',async(req,res)=>{
  const month = req.query.month 

  // Define end points from three Apis 

  const endPoints = [
    `/statatics/month=${month}`,
    `/bar-chart/month=${month}`,
    `/pie-chart/month=${month}`
  ]
  try{
    const combinedData = await fetchDataFromAllAPIS(endPoints) ;
    res.json(combinedData);

  }catch(error){
    res.status(500).json({error:'Internal Server error'})
  }
})


