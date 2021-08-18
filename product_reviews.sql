DROP DATABASE IF EXISTS product_reviews;

CREATE DATABASE product_reviews;

\c product_reviews;

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  review_date BIGINT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  recommend BOOLEAN NOT NULL,
  reported BOOLEAN NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  response TEXT DEFAULT NULL,
  helpfulness INTEGER DEFAULT 0
);

CREATE TABLE reviews_photos (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL references reviews(id),
  photo_url TEXT NOT NULL
);

CREATE TABLE characteristics (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  characteristic_name VARCHAR(100)
);

CREATE TABLE characteristic_reviews (
  id SERIAL PRIMARY KEY,
  characteristic_id INTEGER references characteristics(id),
  review_id INTEGER references reviews(id),
  review_value INTEGER NOT NULL
);

CREATE INDEX reviews_product_id ON reviews (product_id);
CREATE INDEX reviews_photos_review_id ON reviews_photos (review_id);
CREATE INDEX characteristics_reviews_review_id ON characteristic_reviews (review_id);
CREATE INDEX characteristics_reviews_characteristic_id ON characteristic_reviews (characteristic_id);

\COPY reviews FROM './CSVs/reviews.csv' CSV HEADER;
\COPY reviews_photos FROM './CSVs/reviews_photos.csv' CSV HEADER;
\COPY characteristics FROM './CSVs/characteristics.csv' CSV HEADER;
\COPY characteristic_reviews FROM './CSVs/characteristic_reviews.csv' CSV HEADER;

SELECT setval('characteristic_reviews_id_seq', (SELECT MAX(id) FROM characteristic_reviews));
SELECT setval('reviews_photos_id_seq', (SELECT MAX(id) FROM reviews_photos));
SELECT setval('reviews_id_seq', (SELECT MAX(id) FROM reviews));
