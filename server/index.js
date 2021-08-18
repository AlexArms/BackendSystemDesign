require('newrelic');
const express = require('express');
const app = express();
const PORT = 3333;
const { Pool } = require('pg');
const cors = require('cors');

app.use(cors());
app.use(express.json())

const database = new Pool({
  host: '3.22.164.231',
  port: 5432,
  database: 'product_reviews',
  user: 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

database.on('error',  (error, client) => {
  console.error('Error: ', error);
});

database.on('connect', (client) => {
  console.log('client connected');
});

database.on('remove', (client) => {
  console.log('client disconnected');
});

app.listen(PORT, (error) => {
  if (error) {
    console.log('failed to connect D:');
  } else {
    console.log(`connected - listening at http://localhost:${PORT} :D`);
  }
});

app.get('/reviews', (req, res) => {
  console.log(req.query);
  let productId = req.query.product_id;
  let count = req.query.count || 5;
  let pages = req.query.pages || 1;
  let sort = req.query.sort || 'relevance';
  const query = `
  SELECT
    reviews.id AS review_id,
    reviews.rating AS rating,
    reviews.summary AS summary,
    reviews.recommend AS recommend,
    reviews.response AS response,
    reviews.body AS body,
    reviews.review_date AS date,
    reviews.reviewer_name AS reviewer_name,
    reviews.helpfulness AS helpfulness,
    ARRAY_AGG(reviews_photos.photo_url) AS photos
  FROM
    reviews
  LEFT JOIN
    reviews_photos
  ON
    reviews.id = reviews_photos.review_id
  WHERE reviews.product_id = $1
  GROUP BY reviews.id
  ORDER BY reviews.id
  OFFSET $2 * ($3 - 1)
  LIMIT $2
`;
  const qParams = [productId, count, pages];
  database.query(query, qParams)
    .then(({ rows }) => {
      rows.forEach(row => {
        if (!row.photos[0]) row.photos = [];
        if (row.response === 'null') row.response = null;
        row.date = Number(row.date);
      });

      const sortReviewsList = (reviewsList, order) => {
        if (order === 'relevance') {
          let relevantSort = reviewsList.sort((a, b) => {
            return b.helpfulness - a.helpfulness
            || new Date(b.date) - new Date(a.date);
          });
          return relevantSort;
        }

        if (order === 'helpful') {
          let helpfulSort = reviewsList.sort((a, b) => {
            return b.helpfulness - a.helpfulness;
          });
          return helpfulSort;
        }

        if (order === 'newest') {
          let newSort = reviewsList.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
          });
          return newSort;
        }
      };

      const sortedReviews = sortReviewsList(rows, sort);

      res.send({
        product: productId,
        page: pages,
        count: count,
        results: sortedReviews
      });
    })
    .catch(error => {
      res.send(error);
    });
});

app.get('/reviews/meta', (req, res) => {
  console.log(req);
  const productId = req.query.product_id;
  let query = `
  SELECT
    reviews.recommend,
    reviews.rating,
    characteristic_reviews.review_value,
    characteristics.characteristic_name, characteristics.id
  FROM
    reviews
    LEFT JOIN characteristic_reviews ON reviews.id = characteristic_reviews.review_id
    LEFT JOIN characteristics ON characteristic_reviews.characteristic_id = characteristics.id
  WHERE
    reviews.product_id = $1
  AND
    reviews.reported = false;
  `;
  const qParams = [productId];
  database.query(query, qParams)
    .then(({ rows }) => {

      const formattedData = {
        product_id: productId,
        ratings: {
          "1": 0,
          "2": 0,
          "3": 0,
          "4": 0,
          "5": 0,
        },
        recommended: {
          "true": 0,
          "false": 0
        },
        characteristics: {}
      }

      const { ratings, recommended, characteristics } = formattedData;

      rows.forEach(row => {
        ratings[row.rating]++;
        recommended[row.recommend]++;
        if (!characteristics[row.characteristic_name]) {
          characteristics[row.characteristic_name] = {};
          characteristics[row.characteristic_name].id = row.id;
          characteristics[row.characteristic_name].count = 1;
          characteristics[row.characteristic_name].value = row.review_value;
        } else {
          characteristics[row.characteristic_name].count++;
          characteristics[row.characteristic_name].value += row.review_value;
        }
      });

      // average each characteristic value
      for (let characteristic in characteristics) {
        characteristics[characteristic].value = String((characteristics[characteristic].value / characteristics[characteristic].count));
        delete characteristics[characteristic].count;
      }

      // each rating, as well as each true/false value in recommended, needs to be divided by the # of characteristics
      const characteristicCount = Object.keys(characteristics).length;
      for (let rating in ratings) {
        ratings[rating] = ratings[rating] / characteristicCount;
      }
      recommended[true] = recommended[true] / characteristicCount;
      recommended[false] = recommended[false] / characteristicCount;

      res.send(formattedData);
    })
    .catch(error => {
      res.send(error);
    });
});

app.post('/reviews', ({ body }, res) => {
  const query = `
    INSERT INTO reviews (
      product_id,
      rating,
      review_date,
      summary,
      body,
      recommend,
      reported,
      reviewer_name,
      reviewer_email
    )
    VALUES (
      $1,
      $2,
      $9,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8
    ) RETURNING id;
    `;
  const params = [body.product_id, body.rating, body.summary, body.body, body.recommend, false, body.name, body.email, Date.now()];
  database.query(query, params)
    .then(response => {
      const newReviewId = response.rows[0].id;
      Promise.all(body.photos.map((photo) => {
        const queryTwo = 'INSERT INTO reviews_photos (review_id, photo_url) VALUES ($1, $2)'
        const paramsTwo = [newReviewId, photo];
        return database.query(queryTwo, paramsTwo);
      }))
      .then(response => {
        let characteristicIds = Object.keys(body.characteristics);
        let characteristicValues = Object.values(body.characteristics);
        Promise.all(characteristicIds.map((id, index) => {
          const queryThree = 'INSERT INTO characteristic_reviews (characteristic_id, review_id, review_value) VALUES ($1, $2, $3)'
          const paramsThree = [id, newReviewId, characteristicValues[index]];
          return database.query(queryThree, paramsThree);
        }))
        .then(result => {
          res.send(result);
        })
        .catch(error => {
          res.send(error);
        })
      })
      .catch(error => {
        res.send(error);
      });
    })
    .catch(error => {
      res.send(error);
    });
});

app.put('/reviews/:review_id/helpful', ({params}, res) => {
  let query = 'UPDATE reviews SET helpfulness = helpfulness + 1 WHERE id = $1';
  let qParams = [params.review_id];
  database.query(query, qParams)
    .then((response) => {
      res.send();
    })
    .catch((error) => {
      res.send(error);
    });
});

app.put('/reviews/:review_id/report', ({params}, res) => {
  let query = 'UPDATE reviews SET reported = true WHERE id = $1';
  let qParams = [params.review_id];
  database.query(query, qParams)
    .then((response) => {
      res.send();
    })
    .catch((error) => {
      res.send(error);
    });
});
